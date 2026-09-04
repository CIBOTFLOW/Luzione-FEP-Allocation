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

function rehashCommand(data) {
  data.input.command.payloadHash = hash(data.input.command.payload)
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

async function expectAtomicFailure(mutate, code, { rehash = true } = {}) {
  const data = fixture()
  mutate(data)
  if (rehash) rehashCommand(data)
  const adapter = new A02B03AllocationAdapter()
  await assert.rejects(adapter.simulateAtomic(data.input, data.now), (error) => error.code === code)
  assert.deepEqual(adapter.diagnostics(), zeroEffects())
}

test('FEP-owned post-commit evidence closes exact receipt, readback, head, and producer pins', async () => {
  const data = fixture()
  const result = await new A02B03AllocationAdapter().simulateAtomic(data.input, data.now)
  assert.equal(result.receipt.producerPins.fep, `CIBOTFLOW/FEP-Platform@${CONTRACT_PINS.fepJournalProducerSha}`)
  assert.equal(result.receipt.producerPins.fepPinSha256, CONTRACT_PINS.fepJournalPinSha256)
  assert.equal(result.receipt.producerPins.fepJournalFixtureSha256, CONTRACT_PINS.fepJournalFixtureSha256)
  assert.deepEqual(result.receipt.evidence, {
    commandId: 'cmd-b07-synthetic-1',
    upstreamReceiptId: 'fep-receipt-sha256:d738846f69c4705c95c66fd0cec511ecacdccdcbfe5095a7f2cb031b52f968cc',
    sourceReadbackRef: 'fep-readback-sha256:c640faab21e30b33ff2f7a9731a7edbcede09b0bbe2de4ce52a8e8bbae09ae16',
    fepJournalHeadHash: 'ee613e741ddc6d5e940d6641cccfbec7fd664f0a3a08d1d516ed0b835ad0e818',
    fepSourceReceiptHash: 'ee613e741ddc6d5e940d6641cccfbec7fd664f0a3a08d1d516ed0b835ad0e818',
    fepAppendIndex: 1,
    fepSourceSequence: 1,
    fepReceiptDisposition: 'APPENDED',
    fepReplayValid: true,
    fepPreCommandObjectVersion: 'fep-balanced-journal-head/genesis',
    fepCommittedObjectVersion: 'fep-balanced-journal-head/sha256:ee613e741ddc6d5e940d6641cccfbec7fd664f0a3a08d1d516ed0b835ad0e818',
    fepSourceConfirmed: true,
    fepBusinessFinal: true,
  })
})

test('FEP replay is accepted only when durable receipt and post-commit evidence both agree', async () => {
  const data = fixture()
  data.input.command.payload.allocationSnapshot.funding.journalReceipt.disposition = 'REPLAYED'
  data.input.fepPostCommit.output.journal.disposition = 'REPLAYED'
  data.input.fepPostCommit.output.receipt.idempotency.replay = true
  rehashCommand(data)
  const result = await new A02B03AllocationAdapter().simulateAtomic(data.input, data.now)
  assert.equal(result.receipt.evidence.fepReceiptDisposition, 'REPLAYED')

  const mismatch = fixture()
  mismatch.input.command.payload.allocationSnapshot.funding.journalReceipt.disposition = 'REPLAYED'
  rehashCommand(mismatch)
  await assert.rejects(new A02B03AllocationAdapter().simulateAtomic(mismatch.input, mismatch.now), (error) => error.code === 'B03_POSTCOMMIT_DURABLE_MISMATCH')
})

test('32 concurrent duplicate deliveries create one immutable replay claim and zero effects', async () => {
  const data = fixture()
  const adapter = new A02B03AllocationAdapter()
  const results = await Promise.all(Array.from({ length: 32 }, () => adapter.simulateAtomic(data.input, data.now)))
  assert.equal(results.filter(({ disposition }) => disposition === 'SIMULATED').length, 1)
  assert.equal(results.filter(({ disposition }) => disposition === 'REPLAYED').length, 31)
  assert.equal(new Set(results.map(({ receipt }) => receipt.receiptHash)).size, 1)
  assert.deepEqual(adapter.diagnostics(), zeroEffects(1))
})

test('synchronous and atomic entrypoints share a tenant-scoped replay namespace', async () => {
  const data = fixture()
  const adapter = new A02B03AllocationAdapter()
  const first = adapter.simulate(data.input, data.now)
  const replay = await adapter.simulateAtomic(data.input, data.now)
  assert.equal(replay.disposition, 'REPLAYED')
  assert.equal(replay.receipt.receiptHash, first.receipt.receiptHash)
  assert.deepEqual(adapter.diagnostics(), zeroEffects(1))
})

test('concurrent conflicting idempotency payload admits one claim and no second receipt', async () => {
  const first = fixture()
  const conflict = fixture()
  conflict.input.command.payload.allocationSnapshot.request.requestedAmountMinor = 600
  rehashCommand(conflict)
  const adapter = new A02B03AllocationAdapter()
  const results = await Promise.allSettled([
    adapter.simulateAtomic(first.input, first.now),
    adapter.simulateAtomic(conflict.input, conflict.now),
  ])
  assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1)
  assert.equal(results.find(({ status }) => status === 'rejected').reason.code, 'COMMAND_REPLAY_CONFLICT')
  assert.deepEqual(adapter.diagnostics(), zeroEffects(1))
})

test('schema, producer, tenant, head, receipt, and readback mismatches leave zero claim/effects', async () => {
  const cases = [
    [(data) => { data.input.command.payload.allocationSnapshot.funding.unownedField = true }, 'B03_SCHEMA_SHAPE_MISMATCH'],
    [(data) => { data.input.command.payload.allocationSnapshot.funding.producerSha = '9'.repeat(40) }, 'B03_PRODUCER_PIN_MISMATCH'],
    [(data) => { data.input.fepPostCommit.output.tenantId = 'tenant-other' }, 'B03_POSTCOMMIT_TENANT_INVALID'],
    [(data) => { data.input.fepPostCommit.output.journal.transaction.transactionHash = '9'.repeat(64) }, 'B03_POSTCOMMIT_TRANSACTION_HASH_MISMATCH'],
    [(data) => { data.input.fepPostCommit.output.receipt.evidence.outboxMessageId = 'fep-no-effect-outbox-sha256:' + '9'.repeat(64) }, 'B03_POSTCOMMIT_EVIDENCE_ID_MISMATCH'],
    [(data) => { data.input.fepPostCommit.output.readback.evidence.sourceReadbackRef = 'fep-readback-sha256:' + '9'.repeat(64) }, 'B03_POSTCOMMIT_EVIDENCE_ID_MISMATCH'],
    [(data) => { data.input.command.payload.allocationSnapshot.funding.journalReadback.headHash = '9'.repeat(64) }, 'B03_READBACK_HEAD_MISMATCH'],
  ]
  for (const [mutate, code] of cases) await expectAtomicFailure(mutate, code)
})

test('ordering/hash, stale/future/pending, balance, and currency paths leave zero claim/effects', async () => {
  const cases = [
    [(data) => { data.input.command.payload.allocationSnapshot.funding.journalReceipt.appendIndex = 2 }, 'B03_APPEND_ORDER_INVALID'],
    [(data) => { data.input.command.payload.allocationSnapshot.funding.journalReceipt.transactionHash = '9'.repeat(64) }, 'B03_TRANSACTION_HASH_MISMATCH'],
    [(data) => { data.input.command.payload.allocationSnapshot.funding.asOf = '2026-09-03T07:00:00.000Z' }, 'FUNDING_SNAPSHOT_STALE'],
    [(data) => { data.input.command.payload.allocationSnapshot.funding.asOf = '2026-09-03T08:13:00.000Z' }, 'FUNDING_SNAPSHOT_STALE'],
    [(data) => { data.input.command.payload.allocationSnapshot.funding.journalReceipt.disposition = 'PENDING' }, 'B03_RECEIPT_PENDING'],
    [(data) => { data.input.command.payload.allocationSnapshot.funding.journalReadback.balances['cash-clearing:USD'] = 699 }, 'B03_READBACK_BALANCE_MISMATCH'],
    [(data) => { data.input.command.payload.allocationSnapshot.funding.availableMinor = 699 }, 'B03_AVAILABLE_BALANCE_MISMATCH'],
    [(data) => { data.input.command.payload.allocationSnapshot.funding.currency = 'EUR' }, 'B03_CURRENCY_MISMATCH'],
  ]
  for (const [mutate, code] of cases) await expectAtomicFailure(mutate, code)
})

test('journal/money/provider/runtime/migration authority injection leaves zero claim/effects', async () => {
  const cases = [
    [(data) => { data.input.command.payload.allocationSnapshot.funding.journalTransaction.effectMode = 'ACTIVE' }, 'B03_EFFECT_AUTHORITY_FORBIDDEN'],
    [(data) => { data.input.command.payload.allocationSnapshot.funding.journalReceipt.effectMode = 'EFFECT' }, 'B03_EFFECT_AUTHORITY_FORBIDDEN'],
    [(data) => { data.input.fepPostCommit.output.journal.authority.productionPost = true }, 'B03_POSTCOMMIT_EFFECT_FORBIDDEN'],
    [(data) => { data.input.fepPostCommit.output.authority.runtimeActivation = true }, 'B03_POSTCOMMIT_EFFECT_FORBIDDEN'],
    [(data) => { data.input.fepPostCommit.output.authority.productionMigration = true }, 'B03_POSTCOMMIT_EFFECT_FORBIDDEN'],
  ]
  for (const [mutate, code] of cases) await expectAtomicFailure(mutate, code)
})

test('injected post-calculation failure rolls back exactly and corrected retry succeeds once', async () => {
  const data = fixture()
  const adapter = new A02B03AllocationAdapter()
  await assert.rejects(adapter.simulateAtomic(data.input, data.now, { injectFailureAfterReceipt: true }), (error) => error.code === 'INJECTED_FAILURE_ROLLBACK')
  assert.deepEqual(adapter.diagnostics(), zeroEffects())
  assert.equal((await adapter.simulateAtomic(data.input, data.now)).disposition, 'SIMULATED')
  assert.deepEqual(adapter.diagnostics(), zeroEffects(1))
})
