import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { A02B03AllocationAdapter } from '../src/a02B03AllocationAdapter.js'
import { hash } from '../src/canonical.js'
import { CONTRACT_PINS } from '../src/contractPins.js'

const fixturePath = new URL('../fixtures/b07/a02-b03-compatible-allocation.json', import.meta.url)

function fixture() {
  return structuredClone(JSON.parse(readFileSync(fixturePath, 'utf8')))
}

function rehashCommand(data) {
  data.input.command.payloadHash = hash(data.input.command.payload)
  data.input.receipt.idempotency.payloadHash = data.input.command.payloadHash
}

function rehashB03(data) {
  const funding = data.input.command.payload.allocationSnapshot.funding
  const receipt = funding.journalReceipt
  receipt.transactionHash = hash({
    ...funding.journalTransaction,
    appendIndex: receipt.appendIndex,
    previousTransactionHash: receipt.previousTransactionHash,
  })
  funding.journalReadback.headHash = receipt.transactionHash
  funding.journalHeadHash = receipt.transactionHash
  funding.sourceReceiptHash = receipt.transactionHash
  rehashCommand(data)
}

function zeroEffectDiagnostics() {
  return {
    committedSimulations: 0,
    replayClaims: 0,
    fepJournalWrites: 0,
    allocationWrites: 0,
    reservationWrites: 0,
    moneyEffects: 0,
    providerEffects: 0,
    runtimeActivations: 0,
    productionMigrations: 0,
  }
}

async function expectAtomicFailure(mutate, code, { rehash = true } = {}) {
  const data = fixture()
  mutate(data)
  if (rehash) rehashCommand(data)
  const adapter = new A02B03AllocationAdapter()
  await assert.rejects(adapter.simulateAtomic(data.input, data.now), (error) => error.code === code)
  assert.deepEqual(adapter.diagnostics(), zeroEffectDiagnostics())
}

test('exact B03 durable receipt, replay readback, schema, migration, and rollback pins are consumed field by field', async () => {
  const data = fixture()
  const result = await new A02B03AllocationAdapter().simulateAtomic(data.input, data.now)
  assert.equal(result.disposition, 'SIMULATED')
  assert.equal(result.receipt.producerPins.fep, `CIBOTFLOW/FEP-Platform@${CONTRACT_PINS.fepJournalProducerSha}`)
  assert.equal(result.receipt.producerPins.fepPinSha256, CONTRACT_PINS.fepJournalPinSha256)
  assert.equal(result.receipt.producerPins.fepSchemaSha256, CONTRACT_PINS.fepJournalSchemaSha256)
  assert.equal(result.receipt.producerPins.fepMigrationSha256, CONTRACT_PINS.fepJournalMigrationSha256)
  assert.equal(result.receipt.producerPins.fepRollbackSha256, CONTRACT_PINS.fepJournalRollbackSha256)
  assert.deepEqual(result.receipt.evidence, {
    commandId: 'cmd-b07-synthetic-1',
    upstreamReceiptId: 'receipt-b07-synthetic-1',
    sourceReadbackRef: 'source-readback-b07-synthetic-1',
    fepJournalHeadHash: '053ff2a4c79a6ca031bde5d2e5bf28d8966b1cdd59ca647b5e40965296d22c81',
    fepSourceReceiptHash: '053ff2a4c79a6ca031bde5d2e5bf28d8966b1cdd59ca647b5e40965296d22c81',
    fepAppendIndex: 1,
    fepSourceSequence: 1,
    fepReceiptDisposition: 'APPENDED',
    fepReplayValid: true,
  })
  assert.equal(result.receipt.authority.writeFepJournal, false)
  assert.equal(result.receipt.authority.writeAllocation, false)
  assert.equal(result.receipt.authority.writeReservation, false)
  assert.equal(result.receipt.authority.moveMoney, false)
  assert.equal(result.receipt.authority.callProvider, false)
})

test('B03 replayed durable receipt remains a valid immutable funding source', async () => {
  const data = fixture()
  data.input.command.payload.allocationSnapshot.funding.journalReceipt.disposition = 'REPLAYED'
  data.input.receipt.idempotency.replay = true
  rehashCommand(data)
  const result = await new A02B03AllocationAdapter().simulateAtomic(data.input, data.now)
  assert.equal(result.receipt.evidence.fepReceiptDisposition, 'REPLAYED')
  assert.equal(result.receipt.evidence.fepReplayValid, true)
})

test('concurrent identical deliveries commit one process-local replay claim and one immutable receipt', async () => {
  const data = fixture()
  const adapter = new A02B03AllocationAdapter()
  const results = await Promise.all(Array.from({ length: 32 }, () => adapter.simulateAtomic(data.input, data.now)))
  assert.equal(results.filter(({ disposition }) => disposition === 'SIMULATED').length, 1)
  assert.equal(results.filter(({ disposition }) => disposition === 'REPLAYED').length, 31)
  assert.equal(new Set(results.map(({ receipt }) => receipt.receiptHash)).size, 1)
  assert.deepEqual(adapter.diagnostics(), {
    ...zeroEffectDiagnostics(),
    committedSimulations: 1,
    replayClaims: 1,
  })
})

test('synchronous and atomic entrypoints share one replay claim namespace', async () => {
  const data = fixture()
  const syncFirst = new A02B03AllocationAdapter()
  const first = syncFirst.simulate(data.input, data.now)
  const asyncReplay = await syncFirst.simulateAtomic(data.input, data.now)
  assert.equal(asyncReplay.disposition, 'REPLAYED')
  assert.equal(asyncReplay.receipt.receiptHash, first.receipt.receiptHash)

  const atomicFirst = new A02B03AllocationAdapter()
  const atomic = await atomicFirst.simulateAtomic(data.input, data.now)
  const syncReplay = atomicFirst.simulate(data.input, data.now)
  assert.equal(syncReplay.disposition, 'REPLAYED')
  assert.equal(syncReplay.receipt.receiptHash, atomic.receipt.receiptHash)
  assert.equal(atomicFirst.diagnostics().replayClaims, 1)
})

test('concurrent idempotency conflict admits only one claim and no second receipt or effect', async () => {
  const first = fixture()
  const conflict = fixture()
  conflict.input.command.payload.allocationSnapshot.request.requestedAmountMinor = 500
  rehashCommand(conflict)
  const adapter = new A02B03AllocationAdapter()
  const results = await Promise.allSettled([
    adapter.simulateAtomic(first.input, first.now),
    adapter.simulateAtomic(conflict.input, conflict.now),
  ])
  assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1)
  const rejection = results.find(({ status }) => status === 'rejected')
  assert.equal(rejection.reason.code, 'COMMAND_REPLAY_CONFLICT')
  assert.deepEqual(adapter.diagnostics(), {
    ...zeroEffectDiagnostics(),
    committedSimulations: 1,
    replayClaims: 1,
  })
})

test('schema, producer, tenant, receipt, readback, and replay mismatches fail with zero claim and zero effects', async () => {
  const cases = [
    [(data) => { data.input.command.payload.allocationSnapshot.funding.unownedField = true }, 'B03_SCHEMA_SHAPE_MISMATCH'],
    [(data) => { data.input.command.payload.allocationSnapshot.funding.producerSha = '9'.repeat(40) }, 'B03_PRODUCER_PIN_MISMATCH'],
    [(data) => { data.input.command.payload.allocationSnapshot.funding.pinSha256 = '9'.repeat(64) }, 'B03_PRODUCER_PIN_MISMATCH'],
    [(data) => { data.input.command.payload.allocationSnapshot.funding.journalReceipt.tenantId = 'tenant-other' }, 'B03_RECEIPT_TENANT_MISMATCH'],
    [(data) => { data.input.command.payload.allocationSnapshot.funding.journalReadback.tenantId = 'tenant-other' }, 'B03_READBACK_TENANT_MISMATCH'],
    [(data) => { data.input.command.payload.allocationSnapshot.funding.journalReceipt.transactionId = 'txn-other' }, 'B03_RECEIPT_TRANSACTION_MISMATCH'],
    [(data) => { data.input.command.payload.allocationSnapshot.funding.journalReadback.valid = false }, 'B03_REPLAY_INVALID'],
    [(data) => { data.input.command.payload.allocationSnapshot.funding.journalReadback.headHash = '9'.repeat(64) }, 'B03_READBACK_HEAD_MISMATCH'],
    [(data) => { data.input.command.payload.allocationSnapshot.funding.sourceReceiptHash = '9'.repeat(64) }, 'B03_SOURCE_RECEIPT_MISMATCH'],
  ]
  for (const [mutate, code] of cases) await expectAtomicFailure(mutate, code)
})

test('ordering and hash replay drift fails with zero claim and zero effects', async () => {
  await expectAtomicFailure((data) => {
    data.input.command.payload.allocationSnapshot.funding.journalReceipt.appendIndex = 2
  }, 'B03_APPEND_ORDER_INVALID')
  await expectAtomicFailure((data) => {
    data.input.command.payload.allocationSnapshot.funding.journalTransaction.sourceSequence = 0
  }, 'B03_SOURCE_ORDER_INVALID')
  await expectAtomicFailure((data) => {
    data.input.command.payload.allocationSnapshot.funding.journalReceipt.transactionHash = '9'.repeat(64)
  }, 'B03_TRANSACTION_HASH_MISMATCH')
  await expectAtomicFailure((data) => {
    data.input.command.payload.allocationSnapshot.funding.journalReadback.transactionCount = 2
  }, 'B03_APPEND_ORDER_INVALID')
})

test('stale, future, pending, and nonfinal durable funding fails with zero claim and zero effects', async () => {
  await expectAtomicFailure((data) => {
    data.input.command.payload.allocationSnapshot.funding.asOf = '2026-09-03T03:00:00.000Z'
  }, 'FUNDING_SNAPSHOT_STALE')
  await expectAtomicFailure((data) => {
    data.input.command.payload.allocationSnapshot.funding.asOf = '2026-09-03T03:31:00.000Z'
  }, 'FUNDING_SNAPSHOT_STALE')
  await expectAtomicFailure((data) => {
    data.input.command.payload.allocationSnapshot.funding.journalTransaction.lifecycleState = 'PENDING'
    rehashB03(data)
  }, 'B03_FINAL_FUNDING_REQUIRED', { rehash: false })
  await expectAtomicFailure((data) => {
    data.input.command.payload.allocationSnapshot.funding.journalReceipt.disposition = 'PENDING'
  }, 'B03_RECEIPT_PENDING')
})

test('balance, currency, and available-readback mismatch fails with zero claim and zero effects', async () => {
  await expectAtomicFailure((data) => {
    data.input.command.payload.allocationSnapshot.funding.journalTransaction.postings[1].amountMinor = 599
    rehashB03(data)
  }, 'B03_JOURNAL_UNBALANCED', { rehash: false })
  await expectAtomicFailure((data) => {
    data.input.command.payload.allocationSnapshot.funding.journalReadback.balances['allocation-available:USD'] = 599
  }, 'B03_READBACK_BALANCE_MISMATCH')
  await expectAtomicFailure((data) => {
    data.input.command.payload.allocationSnapshot.funding.availableMinor = 599
  }, 'B03_AVAILABLE_BALANCE_MISMATCH')
  await expectAtomicFailure((data) => {
    data.input.command.payload.allocationSnapshot.funding.currency = 'EUR'
  }, 'B03_CURRENCY_MISMATCH')
})

test('journal, allocation, reservation, money, provider, runtime, and migration authority injection fails closed', async () => {
  await expectAtomicFailure((data) => {
    data.input.command.payload.allocationSnapshot.funding.journalTransaction.effectMode = 'ACTIVE'
    rehashB03(data)
  }, 'B03_EFFECT_AUTHORITY_FORBIDDEN', { rehash: false })
  await expectAtomicFailure((data) => {
    data.input.command.payload.allocationSnapshot.funding.journalReceipt.effectMode = 'EFFECT'
  }, 'B03_EFFECT_AUTHORITY_FORBIDDEN')
  await expectAtomicFailure((data) => {
    data.input.command.payload.allocationSnapshot.funding.journalReadback.effectMode = 'EFFECT'
  }, 'B03_EFFECT_AUTHORITY_FORBIDDEN')
})

test('injected post-calculation failure rolls back the replay claim exactly and corrected retry succeeds', async () => {
  const data = fixture()
  const adapter = new A02B03AllocationAdapter()
  await assert.rejects(
    adapter.simulateAtomic(data.input, data.now, { injectFailureAfterReceipt: true }),
    (error) => error.code === 'INJECTED_FAILURE_ROLLBACK',
  )
  assert.deepEqual(adapter.diagnostics(), zeroEffectDiagnostics())
  const retry = await adapter.simulateAtomic(data.input, data.now)
  assert.equal(retry.disposition, 'SIMULATED')
  assert.equal(adapter.diagnostics().replayClaims, 1)
})
