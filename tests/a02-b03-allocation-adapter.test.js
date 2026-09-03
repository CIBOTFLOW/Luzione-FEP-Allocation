import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { A02B03AllocationAdapter } from '../src/a02B03AllocationAdapter.js'
import { hash } from '../src/canonical.js'
import { CONTRACT_PINS } from '../src/contractPins.js'
import { createAllocationHttpServer } from '../src/server.js'

const fixturePath = new URL('../fixtures/b07/a02-b03-compatible-allocation.json', import.meta.url)

function fixture() {
  return structuredClone(JSON.parse(readFileSync(fixturePath, 'utf8')))
}

function rehash(data) {
  data.input.command.payloadHash = hash(data.input.command.payload)
  data.input.receipt.idempotency.payloadHash = data.input.command.payloadHash
}

function expectCode(run, code) {
  assert.throws(run, (error) => error.code === code)
}

test('pin records the corrected controller, exact A02 producer/five artifacts, and exact B03 candidate', () => {
  const pin = JSON.parse(readFileSync(new URL('../contracts/B07_PIN.json', import.meta.url), 'utf8'))
  assert.equal(pin.controller_release, 'b626c665d14a7baf419ec2fef42b1ee98b66a370')
  assert.equal(pin.api.producer_sha, 'f2d643a0913b888809c217adfd9bdcef0385b05a')
  assert.deepEqual(pin.api.contract_versions, [
    'luzione-shared-contracts/v0.2-draft.1',
    'luzione-identity-tenant/v0.2-draft.1',
    'luzione-command-envelope/v0.2-draft.1',
    'luzione-receipt-envelope/v0.2-draft.1',
    'luzione-readback-envelope/v0.2-draft.1',
  ])
  assert.deepEqual(pin.api.contract_versions, CONTRACT_PINS.apiContractVersions)
  assert.equal(Object.keys(pin.api.artifact_sha256).length, 5)
  assert.deepEqual(pin.api.artifact_sha256, CONTRACT_PINS.apiArtifactSha256)
  assert.equal(pin.fep.producer_implementation_sha, '5e9b64528c536b9a5b6b283422a171438f09dd48')
  assert.equal(pin.fep.balanced_journal, 'fep-balanced-journal/v0.1-draft')
  assert.equal(pin.effect_mode, 'DISABLED')
  assert.equal(pin.requested_effect, 'NO_EFFECT')

  const preview = JSON.parse(readFileSync(new URL('../public/b07-g0-evidence.json', import.meta.url), 'utf8'))
  assert.equal(preview.controllerRelease, pin.controller_release)
  assert.deepEqual(preview.producerPins.apiContractVersions, pin.api.contract_versions)
  assert.equal(preview.producerPins.fep, `CIBOTFLOW/FEP-Platform@${pin.fep.producer_implementation_sha}`)
  assert.equal(preview.integrated, false)
  assert.equal(preview.productionReady, false)
})

test('public-safe preview endpoint exposes the pinned immutable vector without authentication', async () => {
  const server = createAllocationHttpServer({ service: {}, defaults: {} })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  try {
    const address = server.address()
    const response = await fetch(`http://127.0.0.1:${address.port}/b07-g0-evidence.json`)
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type'), /^application\/json/)
    const body = await response.json()
    assert.equal(body.fixtureVectors.adapterReceiptHash, fixture().expected.adapterReceiptHash)
    assert.equal(body.authority.moveMoney, false)
    assert.equal(body.authority.writeFepJournal, false)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

test('exact producer evidence yields the immutable deterministic balanced NO_EFFECT receipt vector', () => {
  const data = fixture()
  assert.equal(data.input.command.payloadHash, data.expected.payloadHash)
  assert.equal(hash(data.input.command.payload), data.expected.payloadHash)
  const result = new A02B03AllocationAdapter().simulate(data.input, data.now)
  assert.equal(result.disposition, 'SIMULATED')
  assert.equal(result.receipt.allocation.snapshotHash, data.expected.innerSnapshotHash)
  assert.equal(result.receipt.allocation.receiptHash, data.expected.allocationReceiptHash)
  assert.equal(result.receipt.receiptHash, data.expected.adapterReceiptHash)
  assert.deepEqual(result.receipt.balance, {
    requestedMinor: 600,
    allocatedMinor: 600,
    balanced: true,
    currency: 'USD',
  })
  assert.deepEqual(
    result.receipt.allocation.allocations.map(({ eligibilityRef, amountMinor }) => ({ eligibilityRef, amountMinor })),
    [
      { eligibilityRef: 'elig_aaaaaaaaaaaa', amountMinor: 300 },
      { eligibilityRef: 'elig_bbbbbbbbbbbb', amountMinor: 200 },
      { eligibilityRef: 'elig_cccccccccccc', amountMinor: 100 },
    ],
  )
  assert.equal(result.receipt.requestedEffect, 'NO_EFFECT')
  assert.ok(Object.isFrozen(result.receipt))
})

test('candidate ordering is deterministic and exact duplicate delivery replays one receipt', () => {
  const baselineData = fixture()
  const baselineAdapter = new A02B03AllocationAdapter()
  const first = baselineAdapter.simulate(baselineData.input, baselineData.now)
  const replay = baselineAdapter.simulate(baselineData.input, baselineData.now)
  assert.equal(replay.disposition, 'REPLAYED')
  assert.equal(replay.receipt.receiptHash, first.receipt.receiptHash)
  assert.equal(baselineAdapter.diagnostics().committedSimulations, 1)

  const reordered = fixture()
  reordered.input.command.payload.allocationSnapshot.candidates.reverse()
  rehash(reordered)
  const independent = new A02B03AllocationAdapter().simulate(reordered.input, reordered.now)
  assert.deepEqual(independent.receipt.allocation.allocations, first.receipt.allocation.allocations)
  assert.equal(independent.receipt.allocation.receiptHash, first.receipt.allocation.receiptHash)
})

test('cross-tenant and client-derived identity paths fail closed', () => {
  const crossTenant = fixture()
  crossTenant.input.command.context.tenant.tenantId = 'tenant-other'
  expectCode(() => new A02B03AllocationAdapter().simulate(crossTenant.input, crossTenant.now), 'ALLOCATION_CONTEXT_DRIFT')

  const clientDerived = fixture()
  clientDerived.input.command.context.serverDerived = false
  expectCode(() => new A02B03AllocationAdapter().simulate(clientDerived.input, clientDerived.now), 'SERVER_DERIVED_CONTEXT_REQUIRED')

  const unverifiedTenant = fixture()
  unverifiedTenant.input.command.context.tenant.source = 'CLIENT_INPUT'
  expectCode(() => new A02B03AllocationAdapter().simulate(unverifiedTenant.input, unverifiedTenant.now), 'TENANT_AUTHORITY_INVALID')

  const wrongCapability = fixture()
  wrongCapability.input.command.context.authority.capability = 'fep.journal.post'
  expectCode(() => new A02B03AllocationAdapter().simulate(wrongCapability.input, wrongCapability.now), 'CAPABILITY_INVALID')
})

test('each A02 envelope version and the exact five-version set reject drift', () => {
  const cases = [
    [(data) => { data.input.pinnedContractVersions[0] = 'luzione-shared-contracts/v0.2-draft.2' }, 'CONTRACT_PIN_SET_MISMATCH'],
    [(data) => { data.input.command.context.contractVersion = 'luzione-identity-tenant/v0.2-draft.2' }, 'CONTRACT_VERSION_MISMATCH'],
    [(data) => { data.input.command.contractVersion = 'luzione-command-envelope/v0.2-draft.2' }, 'CONTRACT_VERSION_MISMATCH'],
    [(data) => { data.input.receipt.contractVersion = 'luzione-receipt-envelope/v0.2-draft.2' }, 'CONTRACT_VERSION_MISMATCH'],
    [(data) => { data.input.readback.contractVersion = 'luzione-readback-envelope/v0.2-draft.2' }, 'CONTRACT_VERSION_MISMATCH'],
  ]
  for (const [mutate, code] of cases) {
    const data = fixture()
    mutate(data)
    expectCode(() => new A02B03AllocationAdapter().simulate(data.input, data.now), code)
  }
})

test('stale, future, dispatch-pending, and nonfinal evidence fails closed', () => {
  const staleReadback = fixture()
  staleReadback.input.readback.freshness.state = 'STALE'
  staleReadback.input.readback.freshness.freshUntil = '2026-09-03T03:29:59.000Z'
  expectCode(() => new A02B03AllocationAdapter().simulate(staleReadback.input, staleReadback.now), 'FRESH_READBACK_REQUIRED')

  const staleFunding = fixture()
  staleFunding.input.command.payload.allocationSnapshot.funding.asOf = '2026-09-03T03:00:00.000Z'
  rehash(staleFunding)
  expectCode(() => new A02B03AllocationAdapter().simulate(staleFunding.input, staleFunding.now), 'FUNDING_SNAPSHOT_STALE')

  const futureFunding = fixture()
  futureFunding.input.command.payload.allocationSnapshot.funding.asOf = '2026-09-03T03:30:00.000Z'
  rehash(futureFunding)
  expectCode(() => new A02B03AllocationAdapter().simulate(futureFunding.input, futureFunding.now), 'FUNDING_SNAPSHOT_STALE')

  const pending = fixture()
  pending.input.receipt.state = 'DISPATCH_PENDING'
  expectCode(() => new A02B03AllocationAdapter().simulate(pending.input, pending.now), 'DOMAIN_COMMIT_REQUIRED')

  const nonfinal = fixture()
  nonfinal.input.readback.finality = 'PROVIDER_ACKNOWLEDGED'
  nonfinal.input.readback.businessFinal = false
  expectCode(() => new A02B03AllocationAdapter().simulate(nonfinal.input, nonfinal.now), 'SOURCE_FINALITY_REQUIRED')
})

test('same command with changed payload is a conflict and cannot mutate the committed replay record', () => {
  const adapter = new A02B03AllocationAdapter()
  const first = fixture()
  adapter.simulate(first.input, first.now)

  const conflict = fixture()
  conflict.input.command.payload.allocationSnapshot.request.requestedAmountMinor = 500
  rehash(conflict)
  expectCode(() => adapter.simulate(conflict.input, conflict.now), 'COMMAND_REPLAY_CONFLICT')
  assert.deepEqual(adapter.diagnostics(), {
    committedSimulations: 1,
    fepJournalWrites: 0,
    moneyEffects: 0,
    providerEffects: 0,
    runtimeActivations: 0,
    productionMigrations: 0,
  })
})

test('fairness labels do not decide allocations, small groups stay private, and appeal authority remains with FEP', () => {
  const baselineData = fixture()
  const baseline = new A02B03AllocationAdapter().simulate(baselineData.input, baselineData.now).receipt.allocation

  const changed = fixture()
  changed.input.command.commandId = 'cmd-b07-fairness-2'
  changed.input.command.payload.allocationSnapshot.request.idempotencyKey = 'idem-b07-fairness-2'
  changed.input.command.idempotencyKey = 'idem-b07-fairness-2'
  changed.input.receipt.commandId = 'cmd-b07-fairness-2'
  changed.input.readback.evidence.commandId = 'cmd-b07-fairness-2'
  changed.input.receipt.idempotency.key = 'idem-b07-fairness-2'
  changed.input.command.payload.allocationSnapshot.candidates[0].fairnessGroup = 'broad-region-b'
  changed.input.command.payload.allocationSnapshot.candidates[2].fairnessGroup = 'broad-region-a'
  rehash(changed)
  const mutated = new A02B03AllocationAdapter().simulate(changed.input, changed.now).receipt.allocation
  assert.deepEqual(mutated.allocations, baseline.allocations)
  assert.equal(mutated.fairness.decisionUsesFairnessGroup, false)
  assert.ok(mutated.fairness.groups.some((group) => group.suppressed))
  assert.ok(mutated.allocations.every((allocation) => allocation.appeal.authority === 'FEP_PLATFORM'))
  assert.ok(mutated.allocations.every((allocation) => allocation.appeal.adapterCanResolve === false))

  const pii = fixture()
  pii.input.command.context.request.correlationId = 'person@example.com'
  pii.input.command.payload.allocationSnapshot.request.correlationId = 'person@example.com'
  pii.input.receipt.correlationId = 'person@example.com'
  rehash(pii)
  expectCode(() => new A02B03AllocationAdapter().simulate(pii.input, pii.now), 'PRIVATE_DATA_PROHIBITED')
})

test('receipt and readback identity, object, idempotency, and evidence mismatches are rejected', () => {
  const cases = [
    [(data) => { data.input.receipt.tenantId = 'tenant-other' }, 'RECEIPT_CONTEXT_DRIFT'],
    [(data) => { data.input.receipt.idempotency.payloadHash = '9'.repeat(64) }, 'RECEIPT_IDEMPOTENCY_DRIFT'],
    [(data) => { data.input.receipt.object.id = 'req-unrelated' }, 'RECEIPT_OBJECT_DRIFT'],
    [(data) => { data.input.readback.object.id = 'req-unrelated' }, 'READBACK_OBJECT_DRIFT'],
    [(data) => { data.input.readback.evidence.receiptId = 'receipt-unrelated' }, 'READBACK_EVIDENCE_DRIFT'],
  ]
  for (const [mutate, code] of cases) {
    const data = fixture()
    mutate(data)
    expectCode(() => new A02B03AllocationAdapter().simulate(data.input, data.now), code)
  }
})

test('B03 version, producer, schema, receipt, balance, and currency mismatch paths fail closed', () => {
  const cases = [
    [(data) => { data.input.command.payload.allocationSnapshot.funding.contractVersion = 'fep-balanced-journal/v0.2-draft' }, 'FEP_CONTRACT_MISMATCH'],
    [(data) => { data.input.command.payload.allocationSnapshot.funding.producerSha = '9'.repeat(40) }, 'FEP_CONTRACT_MISMATCH'],
    [(data) => { data.input.command.payload.allocationSnapshot.funding.schemaSha256 = '9'.repeat(64) }, 'FEP_CONTRACT_MISMATCH'],
    [(data) => { data.input.command.payload.allocationSnapshot.funding.sourceReceiptHash = 'not-a-digest' }, 'INVALID_HASH'],
    [(data) => { data.input.command.payload.allocationSnapshot.request.requestedAmountMinor = 601 }, 'INSUFFICIENT_FEP_PROJECTION'],
    [(data) => { data.input.command.payload.allocationSnapshot.request.currency = 'EUR' }, 'CURRENCY_MISMATCH'],
  ]
  for (const [mutate, code] of cases) {
    const data = fixture()
    mutate(data)
    rehash(data)
    expectCode(() => new A02B03AllocationAdapter().simulate(data.input, data.now), code)
  }
})

test('effect, activation, synthetic-mode, and schema authority injection attempts are rejected', () => {
  const cases = [
    [(data) => { data.input.command.activation = 'ACTIVE' }, 'DRAFT_ACTIVATION_REQUIRED'],
    [(data) => { data.input.command.requestedEffect.effectClass = 'EXTERNAL_EFFECT' }, 'EFFECT_AUTHORITY_FORBIDDEN'],
    [(data) => { data.input.receipt.effectAuthority = 'GRANTED' }, 'EFFECT_AUTHORITY_FORBIDDEN'],
    [(data) => { data.input.command.payload.simulationMode = 'LIVE' }, 'SYNTHETIC_MODE_REQUIRED'],
    [(data) => { data.input.command.payload.moneyAuthority = true }, 'SCHEMA_SHAPE_MISMATCH'],
  ]
  for (const [mutate, code] of cases) {
    const data = fixture()
    mutate(data)
    expectCode(() => new A02B03AllocationAdapter().simulate(data.input, data.now), code)
  }
})

test('failure rollback leaves no partial replay claim or effects, and corrected retry succeeds', () => {
  const adapter = new A02B03AllocationAdapter()
  const failed = fixture()
  failed.input.command.payload.allocationSnapshot.candidates.forEach((candidate) => {
    candidate.maximumAllocationMinor = 100
  })
  rehash(failed)
  expectCode(() => adapter.simulate(failed.input, failed.now), 'CANDIDATE_CAPACITY_INSUFFICIENT')
  assert.deepEqual(adapter.diagnostics(), {
    committedSimulations: 0,
    fepJournalWrites: 0,
    moneyEffects: 0,
    providerEffects: 0,
    runtimeActivations: 0,
    productionMigrations: 0,
  })

  const corrected = fixture()
  assert.equal(adapter.simulate(corrected.input, corrected.now).disposition, 'SIMULATED')
  assert.equal(adapter.diagnostics().committedSimulations, 1)
})
