import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { A02B03AllocationAdapter } from '../src/a02B03AllocationAdapter.js'
import { hash } from '../src/canonical.js'
import { CONTRACT_PINS } from '../src/contractPins.js'

const fixturePath = new URL('../fixtures/b07/a02-b03-compatible-allocation.json', import.meta.url)
const fepPath = new URL('../fixtures/b07/fep-postcommit-a02-journal.json', import.meta.url)

function fixture() {
  const document = JSON.parse(readFileSync(fixturePath, 'utf8'))
  document.input.fepPostCommit = JSON.parse(readFileSync(fepPath, 'utf8'))
  return structuredClone(document)
}

function rehash(data) {
  data.input.command.payloadHash = hash(data.input.command.payload)
}

function expectCode(run, code) {
  assert.throws(run, (error) => error.code === code)
}

function zeroEffects(committed = 0) {
  return {
    committedSimulations: committed,
    replayClaims: committed,
    fepJournalWrites: 0,
    allocationWrites: 0,
    reservationWrites: 0,
    moneyEffects: 0,
    providerEffects: 0,
    runtimeActivations: 0,
    productionMigrations: 0,
  }
}

test('exact controller, A02 implementation/final, five pins, digest domains, and B03 producer are immutable', () => {
  const pin = JSON.parse(readFileSync(new URL('../contracts/B07_PIN.json', import.meta.url), 'utf8'))
  assert.equal(CONTRACT_PINS.controllerRelease, '1ecf8ead139d4ecd1efc1840c7be6c1bd982d865')
  assert.equal(CONTRACT_PINS.apiProducerSha, '12685f46a60edea23aaa0a5403e300bf8858066b')
  assert.equal(CONTRACT_PINS.apiFinalEvidenceSha, 'bc43d5db8fe58230d6c3d35e32a73e1e8618b71e')
  assert.equal(CONTRACT_PINS.apiContractVersions.length, 5)
  assert.ok(CONTRACT_PINS.apiContractVersions.every((version) => version.endsWith('/v0.2-draft.1')))
  assert.deepEqual(CONTRACT_PINS.apiManifestDigests, {
    rawFile: {
      algorithm: 'sha256-raw-file-v1',
      sha256: '2d7479019d04d24344b1d4bf4d953abee2d3382ed56b8201ebb49289253e00b7',
    },
    canonicalJson: {
      algorithm: 'sha256-canonical-json-recursive-key-sort-v1',
      sha256: 'eaf983e1496187a22688ddfed45b541fe88a3e2b70a2fbc60863fae1a9484208',
    },
  })
  assert.equal(CONTRACT_PINS.fepJournalProducerSha, '7a50cfa9a9ec599241e936a64a58529868ca81eb')
  assert.equal(pin.controller_release, CONTRACT_PINS.controllerRelease)
  assert.equal(pin.api.producer_sha, CONTRACT_PINS.apiProducerSha)
  assert.equal(pin.api.final_evidence_sha, CONTRACT_PINS.apiFinalEvidenceSha)
  assert.deepEqual(pin.api.contract_versions, CONTRACT_PINS.apiContractVersions)
  assert.equal(pin.api.artifact_sha256['contracts/drafts/luzione-shared-contracts-v0.2-draft.1.manifest.json'], CONTRACT_PINS.apiManifestDigests.rawFile.sha256)
  assert.equal(pin.api.manifest_digests.raw_file.sha256, CONTRACT_PINS.apiManifestDigests.rawFile.sha256)
  assert.equal(pin.api.manifest_digests.canonical_json.sha256, CONTRACT_PINS.apiManifestDigests.canonicalJson.sha256)
  assert.notEqual(pin.api.manifest_digests.raw_file.sha256, pin.api.manifest_digests.canonical_json.sha256)
  assert.equal(pin.fep.producer_implementation_sha, CONTRACT_PINS.fepJournalProducerSha)
  assert.equal(pin.fep.command_fixture_sha256, CONTRACT_PINS.fepJournalFixtureSha256)
  assert.equal(pin.fep.identity_tenant_fixture_sha256, CONTRACT_PINS.fepIdentityTenantFixtureSha256)
  assert.equal(pin.fep.allocation_local_identity_tenant_fixture_sha256, CONTRACT_PINS.localIdentityTenantFixtureSha256)
  assert.deepEqual(pin.fep.controller_verified_ci, {
    run_id: 33831032053,
    job_ids: [100893891064, 100893891304],
    artifact_id: 9921685855,
    artifact_digest: 'sha256:536c45d8cc1b53f4fc80834397004a7d354bbc586621a205811188fdbe2ce3c5',
  })
})

test('Allocation accepts only FEP-owned post-commit receipt/readback and produces a deterministic no-effect receipt', () => {
  const data = fixture()
  const result = new A02B03AllocationAdapter().simulate(data.input, data.now)
  assert.equal(result.disposition, 'SIMULATED')
  assert.equal(result.receipt.compatibilityInputHash, hash(data.input))
  assert.equal(result.receipt.allocation.snapshotHash, data.expected.innerSnapshotHash)
  assert.equal(result.receipt.allocation.receiptHash, data.expected.allocationReceiptHash)
  assert.equal(result.receipt.receiptHash, data.expected.adapterReceiptHash)
  assert.equal(result.receipt.evidence.upstreamReceiptId, data.input.fepPostCommit.output.receipt.receiptId)
  assert.equal(result.receipt.evidence.sourceReadbackRef, data.input.fepPostCommit.output.readback.evidence.sourceReadbackRef)
  assert.equal(result.receipt.evidence.fepSourceConfirmed, true)
  assert.equal(result.receipt.evidence.fepBusinessFinal, true)
  assert.equal(result.receipt.evidence.identityTenantBindingHash, '10792cf5bae75494f09fb0eddcee7534e76bd0f16b46a8498c3f9abb371e2492')
  assert.equal(result.receipt.evidence.upstreamIdentityTenantBindingHash, '79f47bf6e8697eee477e40d59783f39ffb8e9a14957891a101a786041b4ea6ff')
  assert.equal(result.receipt.evidence.callerTenantAccepted, false)
  assert.deepEqual(result.receipt.balance, { requestedMinor: 700, allocatedMinor: 700, balanced: true, currency: 'USD' })
  assert.deepEqual(result.receipt.authority, {
    syntheticOnly: true,
    writeFepJournal: false,
    writeAllocation: false,
    writeReservation: false,
    moveMoney: false,
    callProvider: false,
    approveOrDeny: false,
    selectNamedRecipientForSponsor: false,
    resolveAppeal: false,
    runtimeActivation: false,
    productionMigration: false,
  })
  assert.ok(Object.isFrozen(result.receipt))
})

test('caller-pre-minted receipt or readback finality is forbidden', () => {
  for (const field of ['receipt', 'readback']) {
    const data = fixture()
    data.input[field] = { state: 'SOURCE_CONFIRMED', businessFinal: true }
    expectCode(() => new A02B03AllocationAdapter().simulate(data.input, data.now), 'CALLER_PREMINTED_FINALITY_FORBIDDEN')
  }
})

test('Allocation and FEP pre/expected/committed object versions close exact heads', () => {
  const data = fixture()
  const result = new A02B03AllocationAdapter().simulate(data.input, data.now)
  assert.deepEqual(result.receipt.objectVersionTransition, {
    preCommandObjectVersion: 'luzione-fep-allocation-simulation/genesis',
    committedObjectVersion: result.receipt.objectVersionTransition.committedObjectVersion,
  })
  assert.match(result.receipt.objectVersionTransition.committedObjectVersion, /^luzione-fep-allocation-simulation\/sha256:[a-f0-9]{64}$/)
  assert.equal(result.receipt.evidence.fepPreCommandObjectVersion, 'fep-balanced-journal-head/genesis')
  assert.equal(result.receipt.evidence.fepCommittedObjectVersion, `fep-balanced-journal-head/sha256:${result.receipt.evidence.fepJournalHeadHash}`)

  const wrongHead = fixture()
  wrongHead.input.command.expectedObjectVersion = 'luzione-fep-allocation-simulation/sha256:' + '9'.repeat(64)
  wrongHead.input.command.target.objectVersion = wrongHead.input.command.expectedObjectVersion
  expectCode(() => new A02B03AllocationAdapter().simulate(wrongHead.input, wrongHead.now), 'TARGET_BINDING_MISMATCH')
})

test('exact duplicate replays one receipt; changed payload conflicts without a second claim', () => {
  const data = fixture()
  const adapter = new A02B03AllocationAdapter()
  const first = adapter.simulate(data.input, data.now)
  const replay = adapter.simulate(data.input, data.now)
  assert.equal(replay.disposition, 'REPLAYED')
  assert.equal(replay.receipt.receiptHash, first.receipt.receiptHash)

  const changed = fixture()
  changed.input.command.payload.allocationSnapshot.request.requestedAmountMinor = 600
  rehash(changed)
  expectCode(() => adapter.simulate(changed.input, changed.now), 'COMMAND_REPLAY_CONFLICT')
  assert.deepEqual(adapter.diagnostics(), zeroEffects(1))
})

test('tenant and server-derived producer identity drift fail closed', () => {
  const cases = [
    [(data) => { data.input.command.context.tenant.tenantId = 'tenant-other' }, 'ALLOCATION_CONTEXT_DRIFT'],
    [(data) => { data.input.command.context.serverDerived = false }, 'A02_SERVER_DERIVED_CONTEXT_REQUIRED'],
    [(data) => { data.input.command.context.tenant.source = 'CLIENT_INPUT' }, 'A02_TENANT_AUTHORITY_INVALID'],
    [(data) => { data.input.command.context.credentialActor.actorType = 'user' }, 'A02_PRODUCER_IDENTITY_INVALID'],
    [(data) => { data.input.command.context.logicalActor = { actorId: 'agent-x' } }, 'A02_LOGICAL_ACTOR_FORBIDDEN'],
    [(data) => { data.input.fepPostCommit.commandInput.command.context.tenant.tenantId = 'tenant-other' }, 'B03_POSTCOMMIT_CONTEXT_DRIFT'],
    [(data) => { data.input.fepPostCommit.commandInput.command.context.credentialActor.actorType = 'user' }, 'A02_PRODUCER_IDENTITY_INVALID'],
    [(data) => { data.input.fepPostCommit.commandInput.command.context.credentialActor.actorId = 7 }, 'A02_IDENTITY_VALUE_INVALID'],
    [(data) => { data.input.fepPostCommit.commandInput.command.context.logicalActor = { actorId: 'agent-x' } }, 'A02_LOGICAL_ACTOR_FORBIDDEN'],
    [(data) => { data.input.fepPostCommit.commandInput.command.context.authority.authorityClass = false }, 'A02_AUTHORITY_INVALID'],
  ]
  for (const [mutate, code] of cases) {
    const data = fixture()
    mutate(data)
    const adapter = new A02B03AllocationAdapter()
    expectCode(() => adapter.simulate(data.input, data.now), code)
    assert.deepEqual(adapter.diagnostics(), zeroEffects())
  }
})

test('A02 exact pin, implementation, final-evidence, and FEP owner drift fail closed', () => {
  const cases = [
    [(data) => { data.input.pinnedContractVersions[0] = 'luzione-shared-contracts/v0.2-draft.2' }, 'CONTRACT_PIN_SET_MISMATCH'],
    [(data) => { data.input.command.context.contractVersion = 'luzione-identity-tenant/v0.2-draft.2' }, 'A02_IDENTITY_CONTRACT_MISMATCH'],
    [(data) => { data.input.command.contractVersion = 'luzione-command-envelope/v0.2-draft.2' }, 'CONTRACT_VERSION_MISMATCH'],
    [(data) => { data.input.fepPostCommit.output.receipt.contractVersion = 'luzione-receipt-envelope/v0.2-draft.2' }, 'B03_POSTCOMMIT_RECEIPT_INVALID'],
    [(data) => { data.input.fepPostCommit.output.readback.contractVersion = 'luzione-readback-envelope/v0.2-draft.2' }, 'B03_POSTCOMMIT_FINALITY_REQUIRED'],
    [(data) => { data.input.fepPostCommit.output.producer = 'CIBOTFLOW/Luzione-API@' + '9'.repeat(40) }, 'B03_POSTCOMMIT_PRODUCER_MISMATCH'],
    [(data) => { data.input.fepPostCommit.output.producerFinalEvidenceSha = '9'.repeat(40) }, 'B03_POSTCOMMIT_PRODUCER_MISMATCH'],
    [(data) => { data.input.fepPostCommit.producerImplementationSha = '9'.repeat(40) }, 'B03_POSTCOMMIT_OWNER_MISMATCH'],
  ]
  for (const [mutate, code] of cases) {
    const data = fixture()
    mutate(data)
    const adapter = new A02B03AllocationAdapter()
    expectCode(() => adapter.simulate(data.input, data.now), code)
    assert.deepEqual(adapter.diagnostics(), zeroEffects())
  }
})

test('stale, future, pending, nonfinal, and mismatched FEP readback are rejected', () => {
  const cases = [
    [(data) => { data.input.fepPostCommit.output.readback.freshness.state = 'STALE' }, 'B03_POSTCOMMIT_FRESHNESS_REQUIRED'],
    [(data) => { data.input.fepPostCommit.output.readback.freshness.observedAt = '2026-09-03T08:13:00.000Z' }, 'B03_POSTCOMMIT_FRESHNESS_REQUIRED'],
    [(data) => { data.input.fepPostCommit.output.receipt.state = 'DISPATCH_PENDING' }, 'B03_POSTCOMMIT_RECEIPT_INVALID'],
    [(data) => { data.input.fepPostCommit.output.readback.businessFinal = false }, 'B03_POSTCOMMIT_FINALITY_REQUIRED'],
    [(data) => { data.input.fepPostCommit.output.readback.object.version = 'fep-balanced-journal-head/genesis' }, 'B03_POSTCOMMIT_READBACK_MISMATCH'],
  ]
  for (const [mutate, code] of cases) {
    const data = fixture()
    mutate(data)
    const adapter = new A02B03AllocationAdapter()
    expectCode(() => adapter.simulate(data.input, data.now), code)
    assert.deepEqual(adapter.diagnostics(), zeroEffects())
  }
})

test('fairness metadata is non-decisional, small groups are private, and appeal remains FEP-owned', () => {
  const data = fixture()
  const receipt = new A02B03AllocationAdapter().simulate(data.input, data.now).receipt.allocation
  assert.equal(receipt.fairness.decisionUsesFairnessGroup, false)
  assert.ok(receipt.fairness.groups.some((group) => group.suppressed))
  assert.ok(receipt.allocations.every((allocation) => allocation.appeal.authority === 'FEP_PLATFORM'))
  assert.ok(receipt.allocations.every((allocation) => allocation.appeal.adapterCanResolve === false))

  const privateData = fixture()
  privateData.input.command.payload.allocationSnapshot.candidates[0].eligibilityRef = 'person@example.com'
  rehash(privateData)
  const privateAdapter = new A02B03AllocationAdapter()
  expectCode(() => privateAdapter.simulate(privateData.input, privateData.now), 'ELIGIBILITY_REFERENCE_INVALID')
  assert.deepEqual(privateAdapter.diagnostics(), zeroEffects())
})

test('effect, provider, money, runtime, migration, and schema authority injections fail closed', () => {
  const cases = [
    [(data) => { data.input.command.activation = 'ACTIVE' }, 'DRAFT_ACTIVATION_REQUIRED'],
    [(data) => { data.input.command.requestedEffect.effectClass = 'EXTERNAL_EFFECT' }, 'EFFECT_AUTHORITY_FORBIDDEN'],
    [(data) => { data.input.fepPostCommit.output.authority.effectsEnabled = true }, 'B03_POSTCOMMIT_EFFECT_FORBIDDEN'],
    [(data) => { data.input.fepPostCommit.output.journal.authority.moveMoney = true }, 'B03_POSTCOMMIT_EFFECT_FORBIDDEN'],
    [(data) => { data.input.command.payload.providerCall = true }, 'SCHEMA_SHAPE_MISMATCH'],
  ]
  for (const [mutate, code] of cases) {
    const data = fixture()
    mutate(data)
    const adapter = new A02B03AllocationAdapter()
    expectCode(() => adapter.simulate(data.input, data.now), code)
    assert.deepEqual(adapter.diagnostics(), zeroEffects())
  }
})

test('injected failure rolls back exactly and a corrected retry creates the sole claim', async () => {
  const data = fixture()
  const adapter = new A02B03AllocationAdapter()
  await assert.rejects(adapter.simulateAtomic(data.input, data.now, { injectFailureAfterReceipt: true }), (error) => error.code === 'INJECTED_FAILURE_ROLLBACK')
  assert.deepEqual(adapter.diagnostics(), zeroEffects())
  assert.equal((await adapter.simulateAtomic(data.input, data.now)).disposition, 'SIMULATED')
  assert.deepEqual(adapter.diagnostics(), zeroEffects(1))
})
