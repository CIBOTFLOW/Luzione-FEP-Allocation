import { AllocationError, hash } from './canonical.js'
import { CONTRACT_PINS } from './contractPins.js'
import { DeterministicAllocationEngine, hashAllocationSnapshot } from './deterministicAllocator.js'

function fail(code, message, status = 422) {
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
    fail('SCHEMA_SHAPE_MISMATCH', label + ' must be an object')
  }
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('SCHEMA_SHAPE_MISMATCH', label + ' keys do not match the pinned producer shape')
  }
}

function assertText(value, label, maximum = 512) {
  if (typeof value !== 'string' || value.trim().length < 2 || value.length > maximum) {
    fail('SCHEMA_VALUE_INVALID', label + ' must satisfy the pinned producer text bounds')
  }
}

function assertTimestamp(value, label) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    fail('SCHEMA_VALUE_INVALID', label + ' must be a canonical ISO timestamp')
  }
}

function assertDigest(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail('SCHEMA_VALUE_INVALID', label + ' must be a lowercase SHA-256 digest')
  }
}

function assertSame(left, right, code, message) {
  if (hash(left) !== hash(right)) fail(code, message, 409)
}

function validatePinSet(actual) {
  if (
    !Array.isArray(actual) ||
    new Set(actual).size !== actual.length ||
    hash([...actual].sort()) !== hash([...CONTRACT_PINS.apiContractVersions].sort())
  ) {
    fail('CONTRACT_PIN_SET_MISMATCH', 'contract pins must equal the exact five A02 v0.2-draft.1 versions', 409)
  }
}

function validateIdentity(identity) {
  assertExactKeys(identity, [
    'contractVersion',
    'serverDerived',
    'request',
    'credentialActor',
    'logicalActor',
    'tenant',
    'authority',
    'sourceVersionRefs',
  ], 'command.context')
  if (identity.contractVersion !== CONTRACT_PINS.identityContract) {
    fail('CONTRACT_VERSION_MISMATCH', 'identity contract version is not pinned', 409)
  }
  if (identity.serverDerived !== true) {
    fail('SERVER_DERIVED_CONTEXT_REQUIRED', 'identity context must be server derived', 403)
  }

  assertExactKeys(identity.request, ['requestId', 'correlationId', 'traceId', 'spanId', 'requestedAt'], 'command.context.request')
  assertText(identity.request.requestId, 'command.context.request.requestId')
  assertText(identity.request.correlationId, 'command.context.request.correlationId')
  if (!/^[a-f0-9]{32}$/.test(identity.request.traceId) || !/^[a-f0-9]{16}$/.test(identity.request.spanId)) {
    fail('TRACE_CONTEXT_INVALID', 'trace context does not match the pinned producer shape')
  }
  assertTimestamp(identity.request.requestedAt, 'command.context.request.requestedAt')

  assertExactKeys(identity.credentialActor, ['actorId', 'actorType', 'credentialSource'], 'command.context.credentialActor')
  assertText(identity.credentialActor.actorId, 'command.context.credentialActor.actorId')
  if (!['agent', 'service', 'user'].includes(identity.credentialActor.actorType)) {
    fail('ACTOR_INVALID', 'credential actor type is invalid')
  }
  if (!['service-token', 'vercel-oidc'].includes(identity.credentialActor.credentialSource)) {
    fail('CREDENTIAL_SOURCE_INVALID', 'credential source is invalid')
  }
  if (identity.logicalActor !== null) {
    assertExactKeys(identity.logicalActor, ['actorId', 'actorType', 'definitionVersion', 'delegationEvidenceRef'], 'command.context.logicalActor')
    if (identity.logicalActor.actorType !== 'agent') fail('LOGICAL_ACTOR_INVALID', 'logical actor must be an agent')
    assertText(identity.logicalActor.actorId, 'command.context.logicalActor.actorId')
    assertText(identity.logicalActor.definitionVersion, 'command.context.logicalActor.definitionVersion')
    assertText(identity.logicalActor.delegationEvidenceRef, 'command.context.logicalActor.delegationEvidenceRef')
  }

  assertExactKeys(identity.tenant, ['tenantId', 'source', 'boundary'], 'command.context.tenant')
  assertText(identity.tenant.tenantId, 'command.context.tenant.tenantId')
  if (identity.tenant.source !== 'VERIFIED_CREDENTIAL' || identity.tenant.boundary !== 'EXACT') {
    fail('TENANT_AUTHORITY_INVALID', 'tenant must be exact and derived from a verified credential', 403)
  }
  assertExactKeys(identity.authority, ['authorityClass', 'capability', 'purpose'], 'command.context.authority')
  if (
    identity.authority.capability !== 'fep.allocation.simulate' ||
    identity.authority.purpose !== 'synthetic-b07-compatibility'
  ) {
    fail('CAPABILITY_INVALID', 'identity authority is outside the isolated allocation simulation capability', 403)
  }
  if (
    !Array.isArray(identity.sourceVersionRefs) ||
    hash([...identity.sourceVersionRefs].sort()) !== hash(['authority-subject/v0.1', 'request-identity/v1'].sort())
  ) {
    fail('SOURCE_VERSION_MISMATCH', 'identity source versions do not match the producer pin', 409)
  }
}

function validateCommand(command) {
  assertExactKeys(command, [
    'contractVersion',
    'activation',
    'commandId',
    'commandType',
    'context',
    'expectedObjectVersion',
    'idempotencyKey',
    'payload',
    'payloadHash',
    'policyVersionRefs',
    'requestedAt',
    'requestedEffect',
    'target',
  ], 'command')
  if (command.contractVersion !== CONTRACT_PINS.commandContract) {
    fail('CONTRACT_VERSION_MISMATCH', 'command contract version is not pinned', 409)
  }
  if (command.activation !== 'DRAFT_ONLY') fail('DRAFT_ACTIVATION_REQUIRED', 'runtime activation is forbidden', 403)
  if (command.commandType !== 'fep.allocation.simulate') fail('COMMAND_TYPE_INVALID', 'only synthetic allocation simulation is accepted')
  validateIdentity(command.context)
  assertText(command.commandId, 'command.commandId')
  assertText(command.expectedObjectVersion, 'command.expectedObjectVersion')
  assertText(command.idempotencyKey, 'command.idempotencyKey')
  assertTimestamp(command.requestedAt, 'command.requestedAt')
  if (command.requestedAt !== command.context.request.requestedAt) {
    fail('REQUEST_CONTEXT_DRIFT', 'command and identity timestamps differ', 409)
  }
  assertExactKeys(command.requestedEffect, ['effectClass', 'authorizationRef'], 'command.requestedEffect')
  if (command.requestedEffect.effectClass !== CONTRACT_PINS.requestedEffect || command.requestedEffect.authorizationRef !== null) {
    fail('EFFECT_AUTHORITY_FORBIDDEN', 'allocation compatibility commands cannot request an effect', 403)
  }
  assertExactKeys(command.payload, ['simulationMode', 'allocationSnapshot'], 'command.payload')
  if (command.payload.simulationMode !== 'SYNTHETIC_ONLY') {
    fail('SYNTHETIC_MODE_REQUIRED', 'only synthetic payloads are accepted', 403)
  }
  assertDigest(command.payloadHash, 'command.payloadHash')
  if (command.payloadHash !== hash(command.payload)) fail('PAYLOAD_HASH_MISMATCH', 'command payload hash is invalid', 409)
  if (
    !Array.isArray(command.policyVersionRefs) ||
    new Set(command.policyVersionRefs).size !== command.policyVersionRefs.length ||
    !command.policyVersionRefs.includes(CONTRACT_PINS.fepPolicyContract)
  ) {
    fail('POLICY_VERSION_MISMATCH', 'FEP policy version must be pinned exactly once', 409)
  }
  assertExactKeys(command.target, ['ownerProject', 'objectType', 'objectId', 'objectVersion'], 'command.target')
  const request = command.payload.allocationSnapshot?.request
  if (
    command.target.ownerProject !== 'CIBOTFLOW/Luzione-FEP-Allocation' ||
    command.target.objectType !== 'fep-allocation-simulation' ||
    command.target.objectVersion !== CONTRACT_PINS.adapterContract ||
    command.target.objectId !== request?.requestId
  ) {
    fail('TARGET_BINDING_MISMATCH', 'command target does not identify the local allocation simulation', 409)
  }
  if (
    command.context.tenant.tenantId !== request.tenantId ||
    command.context.request.correlationId !== request.correlationId ||
    command.idempotencyKey !== request.idempotencyKey
  ) {
    fail('ALLOCATION_CONTEXT_DRIFT', 'allocation request does not close the A02 tenant, correlation, and idempotency context', 409)
  }
}

function validateReceipt(command, receipt) {
  assertExactKeys(receipt, [
    'contractVersion', 'receiptId', 'commandId', 'correlationId', 'tenantId', 'state',
    'effectAuthority', 'idempotency', 'object', 'evidence',
  ], 'receipt')
  if (receipt.contractVersion !== CONTRACT_PINS.receiptEnvelopeContract) {
    fail('CONTRACT_VERSION_MISMATCH', 'receipt contract version is not pinned', 409)
  }
  if (receipt.state !== 'DOMAIN_COMMITTED') fail('DOMAIN_COMMIT_REQUIRED', 'dispatch-pending receipts are rejected', 409)
  if (receipt.effectAuthority !== 'NOT_GRANTED_BY_CONTRACT') {
    fail('EFFECT_AUTHORITY_FORBIDDEN', 'receipt cannot grant effect authority', 403)
  }
  assertText(receipt.receiptId, 'receipt.receiptId')
  assertExactKeys(receipt.idempotency, ['key', 'payloadHash', 'replay'], 'receipt.idempotency')
  if (typeof receipt.idempotency.replay !== 'boolean') fail('SCHEMA_VALUE_INVALID', 'receipt.idempotency.replay must be boolean')
  assertExactKeys(receipt.object, ['ownerProject', 'type', 'id', 'version'], 'receipt.object')
  assertExactKeys(receipt.evidence, ['eventId', 'outboxMessageId'], 'receipt.evidence')
  assertText(receipt.evidence.eventId, 'receipt.evidence.eventId')
  assertText(receipt.evidence.outboxMessageId, 'receipt.evidence.outboxMessageId')
  if (
    receipt.commandId !== command.commandId ||
    receipt.correlationId !== command.context.request.correlationId ||
    receipt.tenantId !== command.context.tenant.tenantId
  ) {
    fail('RECEIPT_CONTEXT_DRIFT', 'receipt does not close the command tenant and correlation context', 409)
  }
  if (receipt.idempotency.key !== command.idempotencyKey || receipt.idempotency.payloadHash !== command.payloadHash) {
    fail('RECEIPT_IDEMPOTENCY_DRIFT', 'receipt does not close the command idempotency binding', 409)
  }
  assertSame(receipt.object, {
    ownerProject: command.target.ownerProject,
    type: command.target.objectType,
    id: command.target.objectId,
    version: command.target.objectVersion,
  }, 'RECEIPT_OBJECT_DRIFT', 'receipt object does not close the command target')
}

function validateReadback(receipt, readback, now) {
  assertExactKeys(readback, ['contractVersion', 'tenantId', 'finality', 'businessFinal', 'freshness', 'object', 'evidence', 'reason'], 'readback')
  if (readback.contractVersion !== CONTRACT_PINS.readbackContract) {
    fail('CONTRACT_VERSION_MISMATCH', 'readback contract version is not pinned', 409)
  }
  if (readback.tenantId !== receipt.tenantId) fail('READBACK_TENANT_DRIFT', 'readback tenant does not close the receipt', 409)
  if (readback.finality !== 'SOURCE_CONFIRMED' || readback.businessFinal !== true) {
    fail('SOURCE_FINALITY_REQUIRED', 'only source-confirmed business-final readback is accepted', 409)
  }
  assertExactKeys(readback.freshness, ['state', 'observedAt', 'freshUntil'], 'readback.freshness')
  assertTimestamp(now, 'now')
  if (readback.freshness.state !== 'FRESH' || !readback.freshness.observedAt || !readback.freshness.freshUntil) {
    fail('FRESH_READBACK_REQUIRED', 'source-confirmed readback must be fresh and bounded', 409)
  }
  assertTimestamp(readback.freshness.observedAt, 'readback.freshness.observedAt')
  assertTimestamp(readback.freshness.freshUntil, 'readback.freshness.freshUntil')
  if (Date.parse(readback.freshness.observedAt) > Date.parse(now) || Date.parse(readback.freshness.freshUntil) < Date.parse(now)) {
    fail('FRESH_READBACK_REQUIRED', 'readback freshness window does not include validation time', 409)
  }
  assertExactKeys(readback.object, ['ownerProject', 'type', 'id', 'version'], 'readback.object')
  assertSame(readback.object, receipt.object, 'READBACK_OBJECT_DRIFT', 'readback object does not close the receipt object')
  assertExactKeys(readback.evidence, [
    'receiptId', 'commandId', 'eventId', 'providerAcknowledgementRef', 'reconciliationId', 'sourceReadbackRef',
  ], 'readback.evidence')
  if (
    readback.evidence.receiptId !== receipt.receiptId ||
    readback.evidence.commandId !== receipt.commandId ||
    readback.evidence.eventId !== receipt.evidence.eventId
  ) {
    fail('READBACK_EVIDENCE_DRIFT', 'readback evidence does not close the receipt and command', 409)
  }
  assertText(readback.evidence.sourceReadbackRef, 'readback.evidence.sourceReadbackRef')
  assertText(readback.reason, 'readback.reason')
}

function engineEnvelope(input) {
  const { command, readback } = input
  const source = command.payload.allocationSnapshot
  const snapshot = {
    schemaVersion: CONTRACT_PINS.adapterContract,
    effectMode: CONTRACT_PINS.effectMode,
    runAt: source.runAt,
    identity: {
      contractVersion: command.context.contractVersion,
      tenantId: command.context.tenant.tenantId,
      actorIdHash: hash(command.context.credentialActor),
      scopes: ['allocation:simulate'],
      expiresAt: readback.freshness.freshUntil,
    },
    request: {
      ...source.request,
      commandContractVersion: command.contractVersion,
      readbackContractVersion: readback.contractVersion,
    },
    funding: source.funding,
    policy: source.policy,
    candidates: source.candidates,
  }
  return { snapshot, snapshotHash: hashAllocationSnapshot(snapshot) }
}

export class A02B03AllocationAdapter {
  constructor() {
    this.engine = new DeterministicAllocationEngine()
    this.commands = new Map()
  }

  simulate(input, now) {
    validatePinSet(input.pinnedContractVersions)
    validateCommand(input.command)
    validateReceipt(input.command, input.receipt)
    validateReadback(input.receipt, input.readback, now)

    const compatibilityInputHash = hash(input)
    const commandKey = `${input.command.context.tenant.tenantId}:${input.command.commandId}`
    const previous = this.commands.get(commandKey)
    if (previous) {
      if (previous.compatibilityInputHash !== compatibilityInputHash) {
        fail('COMMAND_REPLAY_CONFLICT', 'command id was replayed with different compatibility evidence', 409)
      }
      return immutableClone({ disposition: 'REPLAYED', receipt: previous.receipt })
    }

    const allocation = this.engine.simulate(engineEnvelope(input)).receipt
    if (allocation.allocatedMinor !== input.command.payload.allocationSnapshot.request.requestedAmountMinor) {
      fail('ALLOCATION_BALANCE_MISMATCH', 'allocation receipt does not balance to the requested amount', 409)
    }
    const receiptBody = {
      contractVersion: CONTRACT_PINS.receiptContract,
      receiptId: `b07_${hash({ compatibilityInputHash, purpose: 'B07_A02_B03_NO_EFFECT' }).slice(0, 32)}`,
      compatibilityInputHash,
      producerPins: {
        api: `${CONTRACT_PINS.apiRepository}@${CONTRACT_PINS.apiProducerSha}`,
        apiContractVersions: CONTRACT_PINS.apiContractVersions,
        fep: `${CONTRACT_PINS.fepRepository}@${CONTRACT_PINS.fepJournalProducerSha}`,
        fepJournalContract: CONTRACT_PINS.fepJournalContract,
      },
      evidence: {
        commandId: input.command.commandId,
        upstreamReceiptId: input.receipt.receiptId,
        sourceReadbackRef: input.readback.evidence.sourceReadbackRef,
        fepJournalHeadHash: input.command.payload.allocationSnapshot.funding.journalHeadHash,
        fepSourceReceiptHash: input.command.payload.allocationSnapshot.funding.sourceReceiptHash,
      },
      balance: {
        requestedMinor: input.command.payload.allocationSnapshot.request.requestedAmountMinor,
        allocatedMinor: allocation.allocatedMinor,
        balanced: true,
        currency: allocation.currency,
      },
      allocation,
      effectMode: CONTRACT_PINS.effectMode,
      requestedEffect: CONTRACT_PINS.requestedEffect,
      authority: {
        syntheticOnly: true,
        writeFepJournal: false,
        moveMoney: false,
        approveOrDeny: false,
        selectNamedRecipientForSponsor: false,
        resolveAppeal: false,
        runtimeActivation: false,
        productionMigration: false,
      },
    }
    const receipt = immutableClone({ ...receiptBody, receiptHash: hash(receiptBody) })
    this.commands.set(commandKey, { compatibilityInputHash, receipt })
    return immutableClone({ disposition: 'SIMULATED', receipt })
  }

  diagnostics() {
    return immutableClone({
      committedSimulations: this.commands.size,
      fepJournalWrites: 0,
      moneyEffects: 0,
      providerEffects: 0,
      runtimeActivations: 0,
      productionMigrations: 0,
    })
  }
}
