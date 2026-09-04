import { AllocationError, hash } from './canonical.js'
import { validateA02IdentityTenant } from './a02IdentityTenantAdapter.js'
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
    fail('B03_POSTCOMMIT_SCHEMA_MISMATCH', `${label} must be an object`)
  }
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('B03_POSTCOMMIT_SCHEMA_MISMATCH', `${label} keys do not match B03@${CONTRACT_PINS.fepJournalProducerSha}`)
  }
}

function assertText(value, label) {
  if (typeof value !== 'string' || value.trim().length < 2 || value.length > 512) {
    fail('B03_POSTCOMMIT_VALUE_INVALID', `${label} must be bounded non-empty text`)
  }
}

function assertDigest(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail('B03_POSTCOMMIT_VALUE_INVALID', `${label} must be a lowercase SHA-256 digest`)
  }
}

function assertTimestamp(value, label) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    fail('B03_POSTCOMMIT_VALUE_INVALID', `${label} must be a canonical ISO timestamp`)
  }
}

function assertSame(actual, expected, code, message) {
  if (hash(actual) !== hash(expected)) fail(code, message)
}

function assertExactVersionSet(actual, label) {
  if (!Array.isArray(actual) || new Set(actual).size !== actual.length) {
    fail('B03_POSTCOMMIT_VERSION_MISMATCH', `${label} must contain five unique versions`)
  }
  assertSame([...actual].sort(), [...CONTRACT_PINS.apiContractVersions].sort(), 'B03_POSTCOMMIT_VERSION_MISMATCH', `${label} does not match the exact A02 five-pin bundle`)
}

function journalHeadVersion(hashValue) {
  return hashValue === null
    ? 'fep-balanced-journal-head/genesis'
    : `fep-balanced-journal-head/sha256:${hashValue}`
}

function journalStreamId(tenantId) {
  return `fep-balanced-journal/tenant-sha256:${hash(tenantId)}`
}

function validateUpstreamIdentity(identity, allocationIdentity) {
  const binding = validateA02IdentityTenant(identity, {
    actorType: 'service',
    authorityClass: 'INTERNAL_DRAFT',
    capability: 'fep.journal.simulate',
    purpose: 'synthetic-b03-compatibility',
  })
  if (binding.tenant.tenantId !== allocationIdentity.tenant.tenantId
    || binding.correlationId !== allocationIdentity.request.correlationId) {
    fail('B03_POSTCOMMIT_CONTEXT_DRIFT', 'FEP journal evidence does not close the Allocation tenant and correlation context', 403)
  }
  return binding
}

function validateCommandInput(commandInput, allocationIdentity) {
  assertExactKeys(commandInput, ['pinnedContractVersions', 'command'], 'fepPostCommit.commandInput')
  assertExactVersionSet(commandInput.pinnedContractVersions, 'fepPostCommit.commandInput.pinnedContractVersions')
  const command = commandInput.command
  assertExactKeys(command, [
    'contractVersion', 'activation', 'commandId', 'commandType', 'context', 'expectedObjectVersion',
    'idempotencyKey', 'payload', 'payloadHash', 'policyVersionRefs', 'requestedAt', 'requestedEffect', 'target',
  ], 'fepPostCommit.commandInput.command')
  if (command.contractVersion !== CONTRACT_PINS.commandContract || command.activation !== 'DRAFT_ONLY' || command.commandType !== 'fep.journal.simulate') {
    fail('B03_POSTCOMMIT_COMMAND_INVALID', 'upstream command is not the strict effect-disabled FEP journal command')
  }
  assertText(command.commandId, 'fep command id')
  assertText(command.idempotencyKey, 'fep command idempotency key')
  assertTimestamp(command.requestedAt, 'fep command requestedAt')
  const identityBinding = validateUpstreamIdentity(command.context, allocationIdentity)
  if (command.requestedAt !== command.context.request.requestedAt) {
    fail('B03_POSTCOMMIT_CONTEXT_DRIFT', 'FEP command and identity timestamps differ')
  }
  assertExactKeys(command.requestedEffect, ['effectClass', 'authorizationRef'], 'fepPostCommit.commandInput.command.requestedEffect')
  if (command.requestedEffect.effectClass !== 'NO_EFFECT' || command.requestedEffect.authorizationRef !== null) {
    fail('B03_POSTCOMMIT_EFFECT_FORBIDDEN', 'FEP command cannot request an effect or authorization', 403)
  }
  assertExactKeys(command.payload, ['simulationMode', 'journalDraft', 'objectVersionPrecondition'], 'fepPostCommit.commandInput.command.payload')
  if (command.payload.simulationMode !== 'SYNTHETIC_ONLY') {
    fail('B03_POSTCOMMIT_EFFECT_FORBIDDEN', 'FEP command must remain synthetic', 403)
  }
  assertDigest(command.payloadHash, 'fep command payload hash')
  if (command.payloadHash !== hash(command.payload)) fail('B03_POSTCOMMIT_PAYLOAD_HASH_MISMATCH', 'FEP command payload hash does not replay')
  assertSame(command.policyVersionRefs, ['command-ledger/v0.1'], 'B03_POSTCOMMIT_VERSION_MISMATCH', 'FEP command policy pin drifted')
  assertExactKeys(command.payload.objectVersionPrecondition, ['expectedAppendIndex', 'preCommandObjectVersion'], 'fepPostCommit.commandInput.command.payload.objectVersionPrecondition')
  const draft = command.payload.journalDraft
  const preCommandVersion = journalHeadVersion(draft.expectedPreviousHash)
  if (!Number.isSafeInteger(command.payload.objectVersionPrecondition.expectedAppendIndex)
    || command.payload.objectVersionPrecondition.expectedAppendIndex < 1
    || command.payload.objectVersionPrecondition.preCommandObjectVersion !== preCommandVersion
    || command.expectedObjectVersion !== preCommandVersion) {
    fail('B03_POSTCOMMIT_PRECONDITION_MISMATCH', 'FEP expected object version is not the exact pre-command journal head')
  }
  assertExactKeys(command.target, ['ownerProject', 'objectType', 'objectId', 'objectVersion'], 'fepPostCommit.commandInput.command.target')
  if (command.target.ownerProject !== CONTRACT_PINS.fepRepository
    || command.target.objectType !== 'fep-balanced-journal'
    || command.target.objectId !== journalStreamId(command.context.tenant.tenantId)
    || command.target.objectVersion !== preCommandVersion) {
    fail('B03_POSTCOMMIT_TARGET_MISMATCH', 'FEP command target does not bind the exact tenant journal head')
  }
  return { command, identityBinding }
}

function expectedEvidenceIds(command, transactionHash) {
  const binding = {
    contract: 'fep-a02-journal-evidence/v0.1',
    tenantId: command.context.tenant.tenantId,
    commandId: command.commandId,
    idempotencyKey: command.idempotencyKey,
    payloadHash: command.payloadHash,
    transactionHash,
  }
  return {
    receiptId: `fep-receipt-sha256:${hash({ ...binding, kind: 'receipt' })}`,
    outboxMessageId: `fep-no-effect-outbox-sha256:${hash({ ...binding, kind: 'no-effect-outbox-evidence' })}`,
    reconciliationId: `fep-reconciliation-sha256:${hash({ ...binding, kind: 'reconciliation' })}`,
    sourceReadbackRef: `fep-readback-sha256:${hash({ ...binding, kind: 'source-readback' })}`,
  }
}

export function validateFepPostCommitEvidence(wrapper, funding, allocationIdentity, now) {
  assertExactKeys(wrapper, ['ownerProject', 'producerImplementationSha', 'commandInput', 'output'], 'fepPostCommit')
  if (wrapper.ownerProject !== CONTRACT_PINS.fepRepository
    || wrapper.producerImplementationSha !== CONTRACT_PINS.fepJournalProducerSha) {
    fail('B03_POSTCOMMIT_OWNER_MISMATCH', 'post-commit evidence is not owned by the exact FEP producer', 403)
  }
  const { command, identityBinding } = validateCommandInput(wrapper.commandInput, allocationIdentity)
  const output = wrapper.output
  assertExactKeys(output, [
    'producer', 'producerFinalEvidenceSha', 'contractVersions', 'compatibilityInputHash', 'tenantId',
    'objectVersionTransition', 'receipt', 'readback', 'journal', 'authority',
  ], 'fepPostCommit.output')
  if (output.producer !== `${CONTRACT_PINS.apiRepository}@${CONTRACT_PINS.apiProducerSha}`
    || output.producerFinalEvidenceSha !== CONTRACT_PINS.apiFinalEvidenceSha) {
    fail('B03_POSTCOMMIT_PRODUCER_MISMATCH', 'FEP output does not pin the exact current A02 implementation and final evidence')
  }
  assertExactVersionSet(output.contractVersions, 'fepPostCommit.output.contractVersions')
  assertDigest(output.compatibilityInputHash, 'fepPostCommit.output.compatibilityInputHash')
  if (output.compatibilityInputHash !== hash(wrapper.commandInput)) {
    fail('B03_POSTCOMMIT_INPUT_HASH_MISMATCH', 'FEP output is not bound to its command/precondition input')
  }
  if (output.tenantId !== command.context.tenant.tenantId) fail('B03_POSTCOMMIT_TENANT_INVALID', 'FEP output tenant drifted')

  assertExactKeys(output.journal, ['contractVersion', 'disposition', 'requestHash', 'transaction', 'authority'], 'fepPostCommit.output.journal')
  if (output.journal.contractVersion !== CONTRACT_PINS.fepJournalContract || !['APPENDED', 'REPLAYED'].includes(output.journal.disposition)) {
    fail('B03_POSTCOMMIT_JOURNAL_INVALID', 'FEP journal output is not committed or replayed')
  }
  assertDigest(output.journal.requestHash, 'fepPostCommit.output.journal.requestHash')
  const draft = command.payload.journalDraft
  if (output.journal.requestHash !== hash(draft)) fail('B03_POSTCOMMIT_INPUT_HASH_MISMATCH', 'FEP journal request hash does not replay')
  const transaction = output.journal.transaction
  const { appendIndex, previousTransactionHash, transactionHash, ...committedDraft } = transaction
  assertSame(committedDraft, draft, 'B03_POSTCOMMIT_TRANSACTION_MISMATCH', 'committed FEP row does not match the command journal draft')
  if (appendIndex !== command.payload.objectVersionPrecondition.expectedAppendIndex
    || previousTransactionHash !== draft.expectedPreviousHash) {
    fail('B03_POSTCOMMIT_HEAD_MISMATCH', 'committed FEP row does not match the pre-command head')
  }
  assertDigest(transactionHash, 'fepPostCommit.output.journal.transaction.transactionHash')
  if (transactionHash !== hash({ ...draft, appendIndex, previousTransactionHash })) {
    fail('B03_POSTCOMMIT_TRANSACTION_HASH_MISMATCH', 'committed FEP row hash does not replay')
  }
  assertExactKeys(output.journal.authority, ['isolatedDraft', 'productionPost', 'moveMoney'], 'fepPostCommit.output.journal.authority')
  if (output.journal.authority.isolatedDraft !== true || output.journal.authority.productionPost !== false || output.journal.authority.moveMoney !== false) {
    fail('B03_POSTCOMMIT_EFFECT_FORBIDDEN', 'FEP journal output exceeds G0 authority', 403)
  }

  const preCommandObjectVersion = journalHeadVersion(previousTransactionHash)
  const committedObjectVersion = journalHeadVersion(transactionHash)
  assertExactKeys(output.objectVersionTransition, ['expectedAppendIndex', 'preCommandObjectVersion', 'committedObjectVersion'], 'fepPostCommit.output.objectVersionTransition')
  assertSame(output.objectVersionTransition, {
    expectedAppendIndex: appendIndex,
    preCommandObjectVersion,
    committedObjectVersion,
  }, 'B03_POSTCOMMIT_OBJECT_VERSION_MISMATCH', 'FEP pre-command and committed object versions do not close the journal append')

  const receipt = output.receipt
  assertExactKeys(receipt, ['contractVersion', 'receiptId', 'commandId', 'correlationId', 'tenantId', 'state', 'effectAuthority', 'idempotency', 'object', 'evidence'], 'fepPostCommit.output.receipt')
  if (receipt.contractVersion !== CONTRACT_PINS.receiptEnvelopeContract || receipt.state !== 'DOMAIN_COMMITTED'
    || receipt.effectAuthority !== 'NOT_GRANTED_BY_CONTRACT') {
    fail('B03_POSTCOMMIT_RECEIPT_INVALID', 'only the FEP-owned domain-committed no-effect receipt is accepted')
  }
  assertExactKeys(receipt.idempotency, ['key', 'payloadHash', 'replay'], 'fepPostCommit.output.receipt.idempotency')
  assertExactKeys(receipt.object, ['ownerProject', 'type', 'id', 'version'], 'fepPostCommit.output.receipt.object')
  assertExactKeys(receipt.evidence, ['eventId', 'outboxMessageId'], 'fepPostCommit.output.receipt.evidence')
  assertSame({
    commandId: receipt.commandId,
    correlationId: receipt.correlationId,
    tenantId: receipt.tenantId,
    idempotencyKey: receipt.idempotency.key,
    payloadHash: receipt.idempotency.payloadHash,
    object: receipt.object,
    eventId: receipt.evidence.eventId,
  }, {
    commandId: command.commandId,
    correlationId: command.context.request.correlationId,
    tenantId: command.context.tenant.tenantId,
    idempotencyKey: command.idempotencyKey,
    payloadHash: command.payloadHash,
    object: {
      ownerProject: CONTRACT_PINS.fepRepository,
      type: 'fep-balanced-journal',
      id: journalStreamId(command.context.tenant.tenantId),
      version: committedObjectVersion,
    },
    eventId: draft.sourceEventId,
  }, 'B03_POSTCOMMIT_RECEIPT_MISMATCH', 'FEP receipt does not close the committed command and row')
  if (receipt.idempotency.replay !== (output.journal.disposition === 'REPLAYED')) {
    fail('B03_POSTCOMMIT_RECEIPT_MISMATCH', 'FEP receipt replay flag does not match journal disposition')
  }

  const readback = output.readback
  assertExactKeys(readback, ['contractVersion', 'tenantId', 'finality', 'businessFinal', 'freshness', 'object', 'evidence', 'reason'], 'fepPostCommit.output.readback')
  if (readback.contractVersion !== CONTRACT_PINS.readbackContract || readback.finality !== 'SOURCE_CONFIRMED' || readback.businessFinal !== true) {
    fail('B03_POSTCOMMIT_FINALITY_REQUIRED', 'Allocation accepts only FEP-owned source-confirmed post-commit readback')
  }
  assertExactKeys(readback.freshness, ['state', 'observedAt', 'freshUntil'], 'fepPostCommit.output.readback.freshness')
  assertTimestamp(now, 'now')
  assertTimestamp(readback.freshness.observedAt, 'fep post-commit observedAt')
  assertTimestamp(readback.freshness.freshUntil, 'fep post-commit freshUntil')
  if (readback.freshness.state !== 'FRESH' || Date.parse(readback.freshness.observedAt) > Date.parse(now)
    || Date.parse(readback.freshness.freshUntil) < Date.parse(now)) {
    fail('B03_POSTCOMMIT_FRESHNESS_REQUIRED', 'FEP post-commit readback is stale, future, or not fresh')
  }
  assertExactKeys(readback.object, ['ownerProject', 'type', 'id', 'version'], 'fepPostCommit.output.readback.object')
  assertSame(readback.object, receipt.object, 'B03_POSTCOMMIT_READBACK_MISMATCH', 'FEP readback object does not close its receipt')
  assertExactKeys(readback.evidence, ['receiptId', 'commandId', 'eventId', 'providerAcknowledgementRef', 'reconciliationId', 'sourceReadbackRef'], 'fepPostCommit.output.readback.evidence')
  const ids = expectedEvidenceIds(command, transactionHash)
  assertSame({
    receiptId: receipt.receiptId,
    outboxMessageId: receipt.evidence.outboxMessageId,
    readbackReceiptId: readback.evidence.receiptId,
    readbackCommandId: readback.evidence.commandId,
    readbackEventId: readback.evidence.eventId,
    reconciliationId: readback.evidence.reconciliationId,
    sourceReadbackRef: readback.evidence.sourceReadbackRef,
    providerAcknowledgementRef: readback.evidence.providerAcknowledgementRef,
  }, {
    receiptId: ids.receiptId,
    outboxMessageId: ids.outboxMessageId,
    readbackReceiptId: ids.receiptId,
    readbackCommandId: command.commandId,
    readbackEventId: draft.sourceEventId,
    reconciliationId: ids.reconciliationId,
    sourceReadbackRef: ids.sourceReadbackRef,
    providerAcknowledgementRef: null,
  }, 'B03_POSTCOMMIT_EVIDENCE_ID_MISMATCH', 'FEP receipt/readback identifiers are not deterministically commit-bound')
  assertText(readback.reason, 'fep post-commit readback reason')

  assertExactKeys(output.authority, ['isolatedDraft', 'syntheticOnly', 'effectsEnabled', 'runtimeActivation', 'productionMigration'], 'fepPostCommit.output.authority')
  assertSame(output.authority, {
    isolatedDraft: true,
    syntheticOnly: true,
    effectsEnabled: false,
    runtimeActivation: false,
    productionMigration: false,
  }, 'B03_POSTCOMMIT_EFFECT_FORBIDDEN', 'FEP output authority exceeds the isolated G0 boundary')

  const durableReceipt = funding.journalReceipt
  assertSame({
    disposition: durableReceipt.disposition,
    transactionId: durableReceipt.transactionId,
    appendIndex: durableReceipt.appendIndex,
    previousTransactionHash: durableReceipt.previousTransactionHash,
    transactionHash: durableReceipt.transactionHash,
  }, {
    disposition: output.journal.disposition,
    transactionId: transaction.transactionId,
    appendIndex,
    previousTransactionHash,
    transactionHash,
  }, 'B03_POSTCOMMIT_DURABLE_MISMATCH', 'durable replay receipt does not match FEP post-commit evidence')
  assertSame(funding.journalTransaction, draft, 'B03_POSTCOMMIT_DURABLE_MISMATCH', 'durable funding transaction does not match FEP command input')
  if (funding.journalReadback.headHash !== transactionHash
    || funding.journalReadback.tenantId !== output.tenantId
    || funding.journalHeadHash !== transactionHash
    || funding.sourceReceiptHash !== transactionHash) {
    fail('B03_POSTCOMMIT_HEAD_MISMATCH', 'funding replay and FEP post-commit heads do not close')
  }

  return immutableClone({
    ownerProject: wrapper.ownerProject,
    implementationSha: wrapper.producerImplementationSha,
    identityTenantBindingHash: identityBinding.identityTenantBindingHash,
    preCommandObjectVersion,
    committedObjectVersion,
    compatibilityInputHash: output.compatibilityInputHash,
    receiptId: receipt.receiptId,
    sourceReadbackRef: readback.evidence.sourceReadbackRef,
    transactionHash,
    appendIndex,
    receiptDisposition: output.journal.disposition,
    sourceConfirmed: true,
    businessFinal: true,
  })
}
