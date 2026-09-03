import { AllocationError, canonicalize, hash } from './canonical.js'
import { CONTRACT_PINS } from './contractPins.js'

function fail(code, message, status = 409) {
  throw new AllocationError(code, message, status)
}

function immutableClone(value) {
  const cloned = structuredClone(value)
  const freeze = (candidate) => {
    if (!candidate || typeof candidate !== 'object' || Object.isFrozen(candidate)) return
    for (const child of Object.values(candidate)) freeze(child)
    Object.freeze(candidate)
  }
  freeze(cloned)
  return cloned
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('B03_SCHEMA_SHAPE_MISMATCH', `${label} must be an object`)
  }
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('B03_SCHEMA_SHAPE_MISMATCH', `${label} keys do not match B03@${CONTRACT_PINS.fepJournalProducerSha}`)
  }
}

function assertText(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 512) {
    fail('B03_SCHEMA_VALUE_INVALID', `${label} must be non-empty bounded text`)
  }
}

function assertDigest(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail('B03_SCHEMA_VALUE_INVALID', `${label} must be a lowercase SHA-256 digest`)
  }
}

function assertTimestamp(value, label) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    fail('B03_SCHEMA_VALUE_INVALID', `${label} must be a canonical ISO timestamp`)
  }
}

function balancesFrom(postings) {
  const balances = {}
  const totals = new Map()
  const entryIds = new Set()
  for (const posting of postings) {
    assertExactKeys(posting, ['entryId', 'accountId', 'direction', 'amountMinor', 'currency'], 'funding.journalTransaction.posting')
    assertText(posting.entryId, 'posting.entryId')
    assertText(posting.accountId, 'posting.accountId')
    if (entryIds.has(posting.entryId)) fail('B03_DUPLICATE_ENTRY', 'journal entry ids must be unique')
    entryIds.add(posting.entryId)
    if (!['DEBIT', 'CREDIT'].includes(posting.direction)) fail('B03_SCHEMA_VALUE_INVALID', 'posting direction is invalid')
    if (!Number.isSafeInteger(posting.amountMinor) || posting.amountMinor <= 0) {
      fail('B03_SCHEMA_VALUE_INVALID', 'posting amount must be positive integer minor units')
    }
    if (!/^[A-Z]{3}$/.test(posting.currency)) fail('B03_SCHEMA_VALUE_INVALID', 'posting currency is invalid')
    const currencyTotals = totals.get(posting.currency) ?? { debit: 0, credit: 0 }
    currencyTotals[posting.direction.toLowerCase()] += posting.amountMinor
    totals.set(posting.currency, currencyTotals)
    const key = `${posting.accountId}:${posting.currency}`
    balances[key] = (balances[key] ?? 0) + (posting.direction === 'DEBIT' ? posting.amountMinor : -posting.amountMinor)
  }
  for (const [currency, total] of totals) {
    if (total.debit !== total.credit) fail('B03_JOURNAL_UNBALANCED', `${currency} journal postings do not balance`)
  }
  return canonicalize(balances)
}

export function validateDurableB03Funding(funding, identity, now) {
  assertExactKeys(funding, [
    'contractVersion',
    'producerSha',
    'pinSha256',
    'schemaSha256',
    'migrationSha256',
    'rollbackSha256',
    'journalTransaction',
    'journalReceipt',
    'journalReadback',
    'journalHeadHash',
    'sourceReceiptHash',
    'availableBalanceKey',
    'availableMinor',
    'currency',
    'asOf',
  ], 'funding')
  if (
    funding.contractVersion !== CONTRACT_PINS.fepJournalContract ||
    funding.producerSha !== CONTRACT_PINS.fepJournalProducerSha ||
    funding.pinSha256 !== CONTRACT_PINS.fepJournalPinSha256 ||
    funding.schemaSha256 !== CONTRACT_PINS.fepJournalSchemaSha256 ||
    funding.migrationSha256 !== CONTRACT_PINS.fepJournalMigrationSha256 ||
    funding.rollbackSha256 !== CONTRACT_PINS.fepJournalRollbackSha256
  ) {
    fail('B03_PRODUCER_PIN_MISMATCH', 'funding evidence does not match the exact durable B03 producer and artifacts')
  }

  const transaction = funding.journalTransaction
  const transactionKeys = [
    'schemaVersion', 'transactionId', 'sourceCode', 'sourceEventId', 'sourceEventHash', 'sourceSequence',
    'idempotencyKey', 'correlationId', 'occurredAt', 'recordedAt', 'lifecycleState', 'effectMode',
    'expectedPreviousHash', 'postings',
  ]
  if (Object.hasOwn(transaction ?? {}, 'reversalOfTransactionId')) transactionKeys.push('reversalOfTransactionId')
  assertExactKeys(transaction, transactionKeys, 'funding.journalTransaction')
  if (transaction.schemaVersion !== CONTRACT_PINS.fepJournalContract) fail('B03_SCHEMA_VERSION_MISMATCH', 'journal transaction schema version is not pinned')
  for (const field of ['transactionId', 'sourceCode', 'sourceEventId', 'idempotencyKey', 'correlationId']) {
    assertText(transaction[field], `journalTransaction.${field}`)
  }
  assertDigest(transaction.sourceEventHash, 'journalTransaction.sourceEventHash')
  if (!Number.isSafeInteger(transaction.sourceSequence) || transaction.sourceSequence < 1) {
    fail('B03_SOURCE_ORDER_INVALID', 'source sequence must be a positive integer')
  }
  assertTimestamp(transaction.occurredAt, 'journalTransaction.occurredAt')
  assertTimestamp(transaction.recordedAt, 'journalTransaction.recordedAt')
  assertTimestamp(funding.asOf, 'funding.asOf')
  assertTimestamp(now, 'now')
  if (Date.parse(now) - Date.parse(funding.asOf) > 15 * 60 * 1000 || Date.parse(funding.asOf) > Date.parse(now)) {
    fail('FUNDING_SNAPSHOT_STALE', 'funding readback must be no more than 15 minutes old and not from the future')
  }
  if (Date.parse(transaction.occurredAt) > Date.parse(transaction.recordedAt) || Date.parse(transaction.recordedAt) > Date.parse(funding.asOf)) {
    fail('B03_SOURCE_ORDER_INVALID', 'journal occurrence, recording, and funding readback timestamps are out of order')
  }
  if (!['SETTLED', 'RECONCILED'].includes(transaction.lifecycleState)) {
    fail('B03_FINAL_FUNDING_REQUIRED', 'pending or nonfinal journal state cannot fund allocation')
  }
  if (transaction.effectMode !== 'DISABLED') fail('B03_EFFECT_AUTHORITY_FORBIDDEN', 'B03 journal effects must remain disabled', 403)
  if (transaction.correlationId !== identity.request.correlationId) fail('B03_CORRELATION_MISMATCH', 'journal and allocation correlation ids differ')
  if (!Array.isArray(transaction.postings) || transaction.postings.length < 2) {
    fail('B03_SCHEMA_VALUE_INVALID', 'journal transaction requires at least two postings')
  }
  const expectedBalances = balancesFrom(transaction.postings)

  const receipt = funding.journalReceipt
  assertExactKeys(receipt, [
    'disposition', 'tenantId', 'transactionId', 'appendIndex', 'previousTransactionHash', 'transactionHash', 'effectMode',
  ], 'funding.journalReceipt')
  if (!['APPENDED', 'REPLAYED'].includes(receipt.disposition)) fail('B03_RECEIPT_PENDING', 'only appended or replayed B03 receipts are accepted')
  if (receipt.tenantId !== identity.tenant.tenantId) fail('B03_RECEIPT_TENANT_MISMATCH', 'B03 receipt tenant does not match server identity', 403)
  if (receipt.transactionId !== transaction.transactionId) fail('B03_RECEIPT_TRANSACTION_MISMATCH', 'B03 receipt transaction id does not match the journal draft')
  if (!Number.isSafeInteger(receipt.appendIndex) || receipt.appendIndex < 1) fail('B03_APPEND_ORDER_INVALID', 'append index must be a positive integer')
  if (receipt.appendIndex === 1 ? receipt.previousTransactionHash !== null : !/^[a-f0-9]{64}$/.test(receipt.previousTransactionHash ?? '')) {
    fail('B03_APPEND_ORDER_INVALID', 'previous hash does not match the append index')
  }
  if (transaction.expectedPreviousHash !== receipt.previousTransactionHash) fail('B03_APPEND_ORDER_INVALID', 'journal expected head and receipt previous hash differ')
  assertDigest(receipt.transactionHash, 'journalReceipt.transactionHash')
  const expectedTransactionHash = hash({ ...transaction, appendIndex: receipt.appendIndex, previousTransactionHash: receipt.previousTransactionHash })
  if (receipt.transactionHash !== expectedTransactionHash) fail('B03_TRANSACTION_HASH_MISMATCH', 'B03 transaction hash does not replay from the pinned schema fields')
  if (receipt.effectMode !== 'NO_EFFECT') fail('B03_EFFECT_AUTHORITY_FORBIDDEN', 'B03 durable receipt must remain NO_EFFECT', 403)

  const readback = funding.journalReadback
  assertExactKeys(readback, ['tenantId', 'valid', 'transactionCount', 'headHash', 'balances', 'effectMode'], 'funding.journalReadback')
  if (readback.tenantId !== identity.tenant.tenantId) fail('B03_READBACK_TENANT_MISMATCH', 'B03 readback tenant does not match server identity', 403)
  if (readback.valid !== true) fail('B03_REPLAY_INVALID', 'B03 replay readback is not valid')
  if (readback.transactionCount !== receipt.appendIndex) fail('B03_APPEND_ORDER_INVALID', 'receipt must be the replayed journal head')
  if (readback.headHash !== receipt.transactionHash || funding.journalHeadHash !== readback.headHash) {
    fail('B03_READBACK_HEAD_MISMATCH', 'receipt, replay readback, and funding head hashes differ')
  }
  if (readback.effectMode !== 'NO_EFFECT') fail('B03_EFFECT_AUTHORITY_FORBIDDEN', 'B03 replay readback must remain NO_EFFECT', 403)
  if (hash(canonicalize(readback.balances)) !== hash(expectedBalances)) fail('B03_READBACK_BALANCE_MISMATCH', 'B03 replay balances do not match the journal postings')
  if (funding.sourceReceiptHash !== receipt.transactionHash) fail('B03_SOURCE_RECEIPT_MISMATCH', 'funding source receipt hash does not bind the durable B03 transaction')
  if (typeof funding.availableBalanceKey !== 'string' || expectedBalances[funding.availableBalanceKey] !== funding.availableMinor) {
    fail('B03_AVAILABLE_BALANCE_MISMATCH', 'funding availability does not equal the selected replayed B03 balance')
  }
  if (!funding.availableBalanceKey.endsWith(`:${funding.currency}`)) fail('B03_CURRENCY_MISMATCH', 'available balance currency does not match funding currency')

  return immutableClone({
    transactionHash: receipt.transactionHash,
    appendIndex: receipt.appendIndex,
    sourceSequence: transaction.sourceSequence,
    receiptDisposition: receipt.disposition,
    replayHeadHash: readback.headHash,
    replayValid: true,
  })
}

export class AtomicNoEffectReplayClaims {
  constructor(claims = new Map()) {
    this.claims = claims
    this.tail = Promise.resolve()
  }

  transact(key, inputHash, produce) {
    const operation = this.tail.then(async () => {
      const existing = this.claims.get(key)
      if (existing) {
        if (existing.inputHash !== inputHash) fail('COMMAND_REPLAY_CONFLICT', 'command id was replayed with different compatibility evidence')
        return immutableClone({ disposition: 'REPLAYED', receipt: existing.receipt })
      }
      const receipt = await produce()
      this.claims.set(key, { inputHash, receipt: immutableClone(receipt) })
      return immutableClone({ disposition: 'SIMULATED', receipt })
    })
    this.tail = operation.then(() => undefined, () => undefined)
    return operation
  }

  size() {
    return this.claims.size
  }
}
