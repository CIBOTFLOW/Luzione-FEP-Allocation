import { A02B03AllocationAdapter } from './a02B03AllocationAdapter.js'
import { AllocationError, hash } from './canonical.js'
import { CONTRACT_PINS } from './contractPins.js'

const CONTRACT_VERSION = 'luzione-fep-allocation-consumer-source-replay/v1'

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

function validateReceiptHash(receipt, label) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    fail('FEP_G03_RECEIPT_SHAPE_MISMATCH', `${label} must be an object`)
  }
  const { receiptHash, ...body } = receipt
  if (typeof receiptHash !== 'string' || receiptHash !== hash(body)) {
    fail('FEP_G03_RECEIPT_HASH_MISMATCH', `${label} does not replay to its declared hash`)
  }
  return receiptHash
}

function assertNoEffect(receipt) {
  const denied = [
    'writeFepJournal',
    'writeAllocation',
    'writeReservation',
    'moveMoney',
    'callProvider',
    'approveOrDeny',
    'selectNamedRecipientForSponsor',
    'resolveAppeal',
    'runtimeActivation',
    'productionMigration',
  ]
  if (
    receipt.effectMode !== CONTRACT_PINS.effectMode ||
    receipt.requestedEffect !== CONTRACT_PINS.requestedEffect ||
    receipt.authority?.syntheticOnly !== true ||
    denied.some((field) => receipt.authority?.[field] !== false) ||
    receipt.allocation?.effectMode !== CONTRACT_PINS.effectMode ||
    receipt.allocation?.authority?.writeFepJournal !== false ||
    receipt.allocation?.authority?.moveMoney !== false ||
    receipt.allocation?.authority?.approveOrDeny !== false ||
    receipt.allocation?.authority?.selectNamedRecipientForSponsor !== false
  ) {
    fail('FEP_G03_EFFECT_AUTHORITY_FORBIDDEN', 'source/replay evidence cannot grant allocation or financial authority', 403)
  }
}

function sourceFrom(input) {
  const postCommit = input.fepPostCommit
  const output = postCommit.output
  const funding = input.command.payload.allocationSnapshot.funding
  const transaction = funding.journalTransaction
  return {
    producer: {
      repository: postCommit.ownerProject,
      implementationSha: postCommit.producerImplementationSha,
    },
    apiProducer: output.producer,
    apiFinalEvidenceSha: output.producerFinalEvidenceSha,
    contractVersions: [...output.contractVersions],
    tenantId: output.tenantId,
    receiptId: output.receipt.receiptId,
    readbackRef: output.readback.evidence.sourceReadbackRef,
    readbackFinality: output.readback.finality,
    businessFinal: output.readback.businessFinal,
    observedAt: output.readback.freshness.observedAt,
    object: structuredClone(output.readback.object),
    journalContract: funding.contractVersion,
    journalTransactionId: transaction.transactionId,
    journalSourceCode: transaction.sourceCode,
    journalSourceEventId: transaction.sourceEventId,
    journalSourceEventHash: transaction.sourceEventHash,
    journalSourceSequence: transaction.sourceSequence,
    journalHeadHash: funding.journalHeadHash,
    sourceReceiptHash: funding.sourceReceiptHash,
    sourceInputHash: hash(input),
  }
}

function validateSourceInputParity(input) {
  const postCommit = input?.fepPostCommit
  const output = postCommit?.output
  const command = input?.command
  const funding = command?.payload?.allocationSnapshot?.funding
  const transaction = funding?.journalTransaction
  const fundingReceipt = funding?.journalReceipt
  const fundingReadback = funding?.journalReadback
  const receipt = output?.receipt
  const readback = output?.readback
  const expectedFepProducer = `${CONTRACT_PINS.fepRepository}@${CONTRACT_PINS.fepJournalProducerSha}`
  const expectedApiProducer = `${CONTRACT_PINS.apiRepository}@${CONTRACT_PINS.apiProducerSha}`
  const tenantId = command?.context?.tenant?.tenantId
  const checks = {
    producer: postCommit?.ownerProject === CONTRACT_PINS.fepRepository
      && postCommit?.producerImplementationSha === CONTRACT_PINS.fepJournalProducerSha,
    apiProducer: output?.producer === expectedApiProducer
      && output?.producerFinalEvidenceSha === CONTRACT_PINS.apiFinalEvidenceSha,
    contractPins: Array.isArray(output?.contractVersions)
      && hash([...output.contractVersions].sort()) === hash([...CONTRACT_PINS.apiContractVersions].sort()),
    tenant: typeof tenantId === 'string'
      && output?.tenantId === tenantId
      && receipt?.tenantId === tenantId
      && readback?.tenantId === tenantId
      && fundingReceipt?.tenantId === tenantId
      && fundingReadback?.tenantId === tenantId,
    receipt: typeof receipt?.receiptId === 'string'
      && readback?.evidence?.receiptId === receipt.receiptId,
    objectIdentity: readback?.object?.ownerProject === CONTRACT_PINS.fepRepository
      && readback?.object?.type === 'fep-balanced-journal'
      && typeof readback?.object?.id === 'string'
      && typeof readback?.object?.version === 'string'
      && hash(receipt?.object) === hash(readback.object)
      && receipt?.object?.version === readback.object.version
      && output?.objectVersionTransition?.committedObjectVersion === readback.object.version,
    journalHead: typeof funding?.journalHeadHash === 'string'
      && funding?.sourceReceiptHash === funding.journalHeadHash
      && fundingReceipt?.transactionHash === funding.journalHeadHash
      && fundingReadback?.headHash === funding.journalHeadHash
      && output?.journal?.transaction?.transactionHash === funding.journalHeadHash,
    journalSource: transaction?.transactionId === output?.journal?.transaction?.transactionId
      && transaction?.sourceEventId === output?.journal?.transaction?.sourceEventId
      && transaction?.sourceEventHash === output?.journal?.transaction?.sourceEventHash
      && transaction?.sourceSequence === output?.journal?.transaction?.sourceSequence,
    finality: readback?.finality === 'SOURCE_CONFIRMED'
      && readback?.businessFinal === true
      && receipt?.state === 'DOMAIN_COMMITTED',
    effectAuthority: command?.requestedEffect?.effectClass === CONTRACT_PINS.requestedEffect
      && command?.requestedEffect?.authorizationRef === null
      && output?.authority?.effectsEnabled === false
      && output?.authority?.runtimeActivation === false
      && output?.authority?.productionMigration === false
      && output?.journal?.authority?.productionPost === false
      && output?.journal?.authority?.moveMoney === false,
    ownerPin: expectedFepProducer === `${postCommit?.ownerProject}@${postCommit?.producerImplementationSha}`,
  }
  const mismatch = Object.entries(checks).find(([, matches]) => matches !== true)
  if (mismatch) {
    fail('FEP_G03_SOURCE_INPUT_PARITY_MISMATCH', `source input parity failed before replay claim at ${mismatch[0]}`)
  }
}

function parityChecks(input, result, source, receiptHash, allocationReceiptHash) {
  const receipt = result.receipt
  const postCommit = input.fepPostCommit
  const output = postCommit.output
  const funding = input.command.payload.allocationSnapshot.funding
  const tenantId = input.command.context.tenant.tenantId
  const committedObjectVersion = output.readback.object.version
  const expectedFepProducer = `${postCommit.ownerProject}@${postCommit.producerImplementationSha}`

  return {
    sourceInputHashMatches: receipt.compatibilityInputHash === source.sourceInputHash,
    apiProducerPinMatches: receipt.producerPins.api === output.producer && output.producer === `${CONTRACT_PINS.apiRepository}@${CONTRACT_PINS.apiProducerSha}`,
    apiFinalEvidenceMatches: receipt.producerPins.apiFinalEvidenceSha === output.producerFinalEvidenceSha && output.producerFinalEvidenceSha === CONTRACT_PINS.apiFinalEvidenceSha,
    fepProducerPinMatches: receipt.producerPins.fep === expectedFepProducer && expectedFepProducer === `${CONTRACT_PINS.fepRepository}@${CONTRACT_PINS.fepJournalProducerSha}`,
    contractPinsMatch: hash([...receipt.producerPins.apiContractVersions].sort()) === hash([...source.contractVersions].sort()),
    tenantMatches: source.tenantId === tenantId && output.receipt.tenantId === tenantId && output.readback.tenantId === tenantId && receipt.allocation.tenantId === tenantId,
    receiptMatches: receipt.evidence.upstreamReceiptId === source.receiptId && output.readback.evidence.receiptId === source.receiptId,
    readbackMatches: receipt.evidence.sourceReadbackRef === source.readbackRef,
    objectIdentityMatches: source.object.ownerProject === CONTRACT_PINS.fepRepository
      && source.object.type === 'fep-balanced-journal'
      && receipt.evidence.fepCommittedObjectVersion === committedObjectVersion
      && output.receipt.object.version === committedObjectVersion,
    journalHeadMatches: receipt.evidence.fepJournalHeadHash === source.journalHeadHash && receipt.allocation.fepJournal.journalHeadHash === source.journalHeadHash,
    sourceReceiptMatches: receipt.evidence.fepSourceReceiptHash === source.sourceReceiptHash && source.sourceReceiptHash === source.journalHeadHash,
    sourceSequenceMatches: receipt.evidence.fepSourceSequence === source.journalSourceSequence,
    sourceFinalityMatches: receipt.evidence.fepSourceConfirmed === true && source.readbackFinality === 'SOURCE_CONFIRMED' && receipt.evidence.fepBusinessFinal === true && source.businessFinal === true,
    commandMatches: receipt.evidence.commandId === input.command.commandId && receipt.allocation.requestId === input.command.payload.allocationSnapshot.request.requestId,
    receiptHashMatches: result.receipt.receiptHash === receiptHash,
    allocationReceiptHashMatches: result.receipt.allocation.receiptHash === allocationReceiptHash,
    zeroEffectAuthority: true,
  }
}

function assertParity(parity) {
  const mismatch = Object.entries(parity).find(([, matches]) => matches !== true)
  if (mismatch) {
    fail('FEP_G03_SOURCE_REPLAY_PARITY_MISMATCH', `consumer source/replay parity failed at ${mismatch[0]}`)
  }
}

export function projectFepG03SourceReplayParity(input, result) {
  if (!['SIMULATED', 'REPLAYED'].includes(result?.disposition)) {
    fail('FEP_G03_DISPOSITION_INVALID', 'consumer result must be an initial simulation or an exact replay')
  }

  const consumerReceiptHash = validateReceiptHash(result.receipt, 'consumer receipt')
  const allocationReceiptHash = validateReceiptHash(result.receipt.allocation, 'allocation receipt')
  assertNoEffect(result.receipt)

  const source = sourceFrom(input)
  const sourceBindingHash = hash(source)
  const parity = parityChecks(input, result, source, consumerReceiptHash, allocationReceiptHash)
  assertParity(parity)

  const parityEvidenceHash = hash({
    contractVersion: CONTRACT_VERSION,
    sourceBindingHash,
    consumerReceiptHash,
    allocationReceiptHash,
    parity,
  })
  const projection = {
    contractVersion: CONTRACT_VERSION,
    sourceState: 'AVAILABLE',
    disposition: result.disposition === 'REPLAYED' ? 'EXACT_REPLAY' : 'SOURCE_CONSUMED',
    source,
    sourceBindingHash,
    parity,
    parityEvidenceHash,
    replay: {
      consumerDisposition: result.disposition,
      exactReplayObserved: result.disposition === 'REPLAYED',
      claimStorage: 'PROCESS_LOCAL_G0_ONLY',
      durableReplayClaimed: false,
      commandId: input.command.commandId,
      idempotencyKey: input.command.idempotencyKey,
      consumerReceiptHash,
      allocationReceiptHash,
    },
    effectAuthority: 'NO_EFFECT',
    authority: {
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
    },
  }
  return immutableClone(projection)
}

export class FepG03AllocationConsumer {
  constructor(adapter = new A02B03AllocationAdapter()) {
    this.adapter = adapter
  }

  consume(input, now) {
    validateSourceInputParity(input)
    return projectFepG03SourceReplayParity(input, this.adapter.simulate(input, now))
  }

  async consumeAtomic(input, now, options = {}) {
    validateSourceInputParity(input)
    const result = await this.adapter.simulateAtomic(input, now, options)
    return projectFepG03SourceReplayParity(input, result)
  }

  diagnostics() {
    return this.adapter.diagnostics()
  }
}
