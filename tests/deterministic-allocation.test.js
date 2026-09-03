import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { CONTRACT_PINS } from '../src/contractPins.js'
import { DeterministicAllocationEngine, hashAllocationSnapshot } from '../src/deterministicAllocator.js'

const fixturePath = new URL('../fixtures/b07/deterministic-allocation.json', import.meta.url)

function fixture() {
  return JSON.parse(readFileSync(fixturePath, 'utf8'))
}

function withCurrentHash(envelope) {
  return { ...envelope, snapshotHash: hashAllocationSnapshot(envelope.snapshot) }
}

test('repository pin matches explicit API and exact FEP journal draft versions', () => {
  const pin = JSON.parse(readFileSync(new URL('../contracts/B07_PIN.json', import.meta.url), 'utf8'))
  assert.equal(pin.controller_release, CONTRACT_PINS.controllerRelease)
  assert.equal(pin.api.producer_sha, CONTRACT_PINS.apiProducerSha)
  assert.deepEqual(pin.api.contract_versions, CONTRACT_PINS.apiContractVersions)
  assert.deepEqual(pin.api.artifact_sha256, CONTRACT_PINS.apiArtifactSha256)
  assert.equal(pin.fep.producer_implementation_sha, CONTRACT_PINS.fepJournalProducerSha)
  assert.equal(pin.fep.pin_sha256, CONTRACT_PINS.fepJournalPinSha256)
  assert.equal(pin.fep.balanced_journal_schema_sha256, CONTRACT_PINS.fepJournalSchemaSha256)
  assert.equal(pin.authority.write_fep_journal, false)
  assert.equal(pin.authority.runtime_activation, false)
})

test('fixture produces a deterministic, balanced, effect-disabled allocation receipt', () => {
  const engine = new DeterministicAllocationEngine()
  const envelope = fixture()
  assert.equal(envelope.snapshotHash, hashAllocationSnapshot(envelope.snapshot))
  const first = engine.simulate(envelope)
  assert.equal(first.disposition, 'SIMULATED')
  assert.deepEqual(first.receipt.allocations.map(({ eligibilityRef, amountMinor }) => ({ eligibilityRef, amountMinor })), [
    { eligibilityRef: 'elig_aaaaaaaaaaaa', amountMinor: 300 },
    { eligibilityRef: 'elig_bbbbbbbbbbbb', amountMinor: 200 },
    { eligibilityRef: 'elig_cccccccccccc', amountMinor: 100 },
  ])
  assert.equal(first.receipt.allocatedMinor, 600)
  assert.deepEqual(first.receipt.authority, {
    writeFepJournal: false,
    moveMoney: false,
    approveOrDeny: false,
    selectNamedRecipientForSponsor: false,
  })
  assert.equal(first.receipt.effectMode, 'DISABLED')
  assert.equal(first.receipt.receiptHash, envelope.expectedReceiptHash)

  const reordered = structuredClone(envelope)
  reordered.snapshot.candidates.reverse()
  reordered.snapshotHash = hashAllocationSnapshot(reordered.snapshot)
  const replay = engine.simulate(reordered)
  assert.equal(replay.disposition, 'REPLAYED')
  assert.equal(replay.receipt.receiptHash, first.receipt.receiptHash)
})

test('fairness labels never influence allocation and small group metrics are suppressed', () => {
  const originalEnvelope = withCurrentHash(fixture())
  const original = new DeterministicAllocationEngine().simulate(originalEnvelope).receipt
  assert.equal(original.fairness.decisionUsesFairnessGroup, false)
  assert.ok(original.fairness.groups.some((group) => group.suppressed))

  const mutation = fixture()
  mutation.snapshot.request.idempotencyKey = 'fairness-mutation'
  mutation.snapshot.candidates[0].fairnessGroup = 'broad-region-b'
  mutation.snapshot.candidates[2].fairnessGroup = 'broad-region-a'
  const mutated = new DeterministicAllocationEngine().simulate(withCurrentHash(mutation)).receipt
  assert.deepEqual(mutated.allocations, original.allocations)
})

test('every opaque decision supports FEP-owned appeal without adapter resolution authority', () => {
  const receipt = new DeterministicAllocationEngine().simulate(withCurrentHash(fixture())).receipt
  assert.ok(receipt.allocations.every((allocation) => allocation.appeal.supported))
  assert.ok(receipt.allocations.every((allocation) => allocation.appeal.authority === 'FEP_PLATFORM'))
  assert.ok(receipt.allocations.every((allocation) => allocation.appeal.adapterCanResolve === false))
  assert.ok(receipt.allocations.every((allocation) => /^[a-f0-9]{64}$/.test(allocation.appeal.referenceHash)))
})

test('private fields and PII-like values fail before calculation', () => {
  const privateField = fixture()
  privateField.snapshot.candidates[0].recipient_id = 'person-1'
  assert.throws(
    () => new DeterministicAllocationEngine().simulate(withCurrentHash(privateField)),
    (error) => error.code === 'PRIVATE_DATA_PROHIBITED' && error.status === 403,
  )
  const email = fixture()
  email.snapshot.request.correlationId = 'person@example.com'
  assert.throws(
    () => new DeterministicAllocationEngine().simulate(withCurrentHash(email)),
    (error) => error.code === 'PRIVATE_DATA_PROHIBITED',
  )
})

test('cross-tenant, expired identity, stale funding, and contract drift fail closed', () => {
  for (const [mutate, expected] of [
    [(snapshot) => { snapshot.identity.tenantId = 'tenant-other' }, 'TENANT_ACCESS_DENIED'],
    [(snapshot) => { snapshot.identity.expiresAt = snapshot.runAt }, 'IDENTITY_EXPIRED'],
    [(snapshot) => { snapshot.funding.asOf = '2026-09-02T19:00:00.000Z' }, 'FUNDING_SNAPSHOT_STALE'],
    [(snapshot) => { snapshot.funding.producerSha = '9'.repeat(40) }, 'FEP_CONTRACT_MISMATCH'],
    [(snapshot) => { snapshot.identity.contractVersion = 'unowned-fork/v1' }, 'API_CONTRACT_MISMATCH'],
  ]) {
    const envelope = fixture()
    mutate(envelope.snapshot)
    assert.throws(
      () => new DeterministicAllocationEngine().simulate(withCurrentHash(envelope)),
      (error) => error.code === expected,
    )
  }
})

test('tampering, conflicting replay, insufficient FEP funding, and insufficient caps are rejected', () => {
  const tampered = withCurrentHash(fixture())
  tampered.snapshot.request.requestedAmountMinor = 599
  assert.throws(
    () => new DeterministicAllocationEngine().simulate(tampered),
    (error) => error.code === 'SNAPSHOT_HASH_MISMATCH',
  )

  const engine = new DeterministicAllocationEngine()
  engine.simulate(withCurrentHash(fixture()))
  const conflict = fixture()
  conflict.snapshot.request.requestedAmountMinor = 500
  assert.throws(
    () => engine.simulate(withCurrentHash(conflict)),
    (error) => error.code === 'IDEMPOTENCY_CONFLICT',
  )

  const funding = fixture()
  funding.snapshot.request.requestedAmountMinor = 601
  assert.throws(
    () => new DeterministicAllocationEngine().simulate(withCurrentHash(funding)),
    (error) => error.code === 'INSUFFICIENT_FEP_PROJECTION',
  )

  const caps = fixture()
  caps.snapshot.candidates.forEach((candidate) => { candidate.maximumAllocationMinor = 100 })
  assert.throws(
    () => new DeterministicAllocationEngine().simulate(withCurrentHash(caps)),
    (error) => error.code === 'CANDIDATE_CAPACITY_INSUFFICIENT',
  )
})
