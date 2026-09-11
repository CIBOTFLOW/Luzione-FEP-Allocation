import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { A02B03AllocationAdapter } from '../src/a02B03AllocationAdapter.js'
import {
  FepG03AllocationConsumer,
  projectFepG03SourceReplayParity,
} from '../src/fepG03ConsumerSourceReplayAdapter.js'

const allocationFixturePath = new URL('../fixtures/b07/a02-b03-compatible-allocation.json', import.meta.url)
const fepFixturePath = new URL('../fixtures/b07/fep-postcommit-a02-journal.json', import.meta.url)

function fixture() {
  const document = JSON.parse(readFileSync(allocationFixturePath, 'utf8'))
  document.input.fepPostCommit = JSON.parse(readFileSync(fepFixturePath, 'utf8'))
  return structuredClone(document)
}

function expectCode(run, code) {
  assert.throws(run, (error) => error.code === code)
}

function zeroEffectDiagnostics(committed = 0) {
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

test('projects exact FEP source identity and receipt/readback/head parity with zero authority', () => {
  const data = fixture()
  const result = new FepG03AllocationConsumer().consume(data.input, data.now)

  assert.equal(result.contractVersion, 'luzione-fep-allocation-consumer-source-replay/v1')
  assert.equal(result.disposition, 'SOURCE_CONSUMED')
  assert.deepEqual(result.source.producer, {
    repository: 'CIBOTFLOW/FEP-Platform',
    implementationSha: '7a50cfa9a9ec599241e936a64a58529868ca81eb',
  })
  assert.equal(result.source.apiProducer, 'CIBOTFLOW/Luzione-API@12685f46a60edea23aaa0a5403e300bf8858066b')
  assert.equal(result.source.apiFinalEvidenceSha, 'bc43d5db8fe58230d6c3d35e32a73e1e8618b71e')
  assert.equal(result.source.tenantId, 'tenant-b03-synthetic')
  assert.equal(result.source.receiptId, data.input.fepPostCommit.output.receipt.receiptId)
  assert.equal(result.source.readbackRef, data.input.fepPostCommit.output.readback.evidence.sourceReadbackRef)
  assert.equal(result.source.journalHeadHash, data.input.command.payload.allocationSnapshot.funding.journalHeadHash)
  assert.ok(Object.values(result.parity).every((value) => value === true))
  assert.equal(result.effectAuthority, 'NO_EFFECT')
  assert.deepEqual(result.authority, {
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
  assert.equal(Object.isFrozen(result), true)
})

test('exact synchronous replay preserves source binding, receipt, and parity evidence hashes', () => {
  const data = fixture()
  const consumer = new FepG03AllocationConsumer()
  const first = consumer.consume(data.input, data.now)
  const replay = consumer.consume(data.input, data.now)

  assert.equal(first.disposition, 'SOURCE_CONSUMED')
  assert.equal(first.replay.exactReplayObserved, false)
  assert.equal(replay.disposition, 'EXACT_REPLAY')
  assert.equal(replay.replay.exactReplayObserved, true)
  assert.equal(replay.sourceBindingHash, first.sourceBindingHash)
  assert.equal(replay.replay.consumerReceiptHash, first.replay.consumerReceiptHash)
  assert.equal(replay.parityEvidenceHash, first.parityEvidenceHash)
  assert.deepEqual(consumer.diagnostics(), zeroEffectDiagnostics(1))
})

test('synchronous and atomic consumers share the existing replay namespace', async () => {
  const data = fixture()
  const syncFirst = new FepG03AllocationConsumer()
  const sync = syncFirst.consume(data.input, data.now)
  const atomicReplay = await syncFirst.consumeAtomic(data.input, data.now)
  assert.equal(atomicReplay.disposition, 'EXACT_REPLAY')
  assert.equal(atomicReplay.parityEvidenceHash, sync.parityEvidenceHash)

  const atomicFirst = new FepG03AllocationConsumer()
  const atomic = await atomicFirst.consumeAtomic(data.input, data.now)
  const syncReplay = atomicFirst.consume(data.input, data.now)
  assert.equal(syncReplay.disposition, 'EXACT_REPLAY')
  assert.equal(syncReplay.parityEvidenceHash, atomic.parityEvidenceHash)
})

test('32 concurrent source deliveries produce one claim and identical parity evidence', async () => {
  const data = fixture()
  const consumer = new FepG03AllocationConsumer()
  const results = await Promise.all(
    Array.from({ length: 32 }, () => consumer.consumeAtomic(data.input, data.now)),
  )

  assert.equal(results.filter((result) => result.disposition === 'SOURCE_CONSUMED').length, 1)
  assert.equal(results.filter((result) => result.disposition === 'EXACT_REPLAY').length, 31)
  assert.equal(new Set(results.map((result) => result.sourceBindingHash)).size, 1)
  assert.equal(new Set(results.map((result) => result.replay.consumerReceiptHash)).size, 1)
  assert.equal(new Set(results.map((result) => result.parityEvidenceHash)).size, 1)
  assert.deepEqual(consumer.diagnostics(), zeroEffectDiagnostics(1))
})

test('changed source evidence under the same command conflicts without a second claim', () => {
  const data = fixture()
  const consumer = new FepG03AllocationConsumer()
  consumer.consume(data.input, data.now)

  const changed = fixture()
  changed.input.fepPostCommit.output.readback.reason = 'Same source head with a changed consumer evidence explanation.'
  expectCode(
    () => consumer.consume(changed.input, changed.now),
    'COMMAND_REPLAY_CONFLICT',
  )
  assert.deepEqual(consumer.diagnostics(), zeroEffectDiagnostics(1))
})

test('source producer, tenant, version, receipt, and readback drift fail before any claim', () => {
  const cases = [
    (data) => { data.input.fepPostCommit.producerImplementationSha = '9'.repeat(40) },
    (data) => { data.input.fepPostCommit.output.readback.tenantId = 'tenant-other' },
    (data) => { data.input.fepPostCommit.output.readback.object.version = 'fep-balanced-journal-head/genesis' },
    (data) => { data.input.fepPostCommit.output.readback.evidence.receiptId = `fep-receipt-sha256:${'8'.repeat(64)}` },
    (data) => { data.input.command.payload.allocationSnapshot.funding.journalHeadHash = '7'.repeat(64) },
  ]

  for (const mutate of cases) {
    const data = fixture()
    mutate(data)
    const consumer = new FepG03AllocationConsumer()
    expectCode(() => consumer.consume(data.input, data.now), 'FEP_G03_SOURCE_INPUT_PARITY_MISMATCH')
    assert.deepEqual(consumer.diagnostics(), zeroEffectDiagnostics())
  }
})

test('bounded FEP-G01 and FEP-G02 heads cannot silently replace the preserved producer pin', () => {
  for (const candidateSha of [
    'ced6c7703b2c651d773d38dec68fc4ef1dde44e1',
    '0a734cb4b3c6a89c98a81df19dd9b3a8b51f6801',
  ]) {
    const data = fixture()
    data.input.fepPostCommit.producerImplementationSha = candidateSha
    const consumer = new FepG03AllocationConsumer()
    expectCode(() => consumer.consume(data.input, data.now), 'FEP_G03_SOURCE_INPUT_PARITY_MISMATCH')
    assert.deepEqual(consumer.diagnostics(), zeroEffectDiagnostics())
  }
})

test('the parity projector rejects a tampered consumer receipt or authority claim', () => {
  const data = fixture()
  const result = new A02B03AllocationAdapter().simulate(data.input, data.now)

  const sourceTamper = structuredClone(result)
  sourceTamper.receipt.evidence.sourceReadbackRef = `fep-readback-sha256:${'9'.repeat(64)}`
  expectCode(
    () => projectFepG03SourceReplayParity(data.input, sourceTamper),
    'FEP_G03_RECEIPT_HASH_MISMATCH',
  )

  const authorityTamper = structuredClone(result)
  authorityTamper.receipt.authority.moveMoney = true
  expectCode(
    () => projectFepG03SourceReplayParity(data.input, authorityTamper),
    'FEP_G03_RECEIPT_HASH_MISMATCH',
  )
})

test('injected failure leaves no replay claim and a corrected retry succeeds once', async () => {
  const data = fixture()
  const consumer = new FepG03AllocationConsumer()
  await assert.rejects(
    consumer.consumeAtomic(data.input, data.now, { injectFailureAfterReceipt: true }),
    (error) => error.code === 'INJECTED_FAILURE_ROLLBACK',
  )
  assert.deepEqual(consumer.diagnostics(), zeroEffectDiagnostics())

  const corrected = await consumer.consumeAtomic(data.input, data.now)
  assert.equal(corrected.disposition, 'SOURCE_CONSUMED')
  assert.deepEqual(consumer.diagnostics(), zeroEffectDiagnostics(1))
})
