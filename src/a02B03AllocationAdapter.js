import { AllocationError, hash } from './canonical.js'
import { validateA02IdentityTenant } from './a02IdentityTenantAdapter.js'
import { AtomicNoEffectReplayClaims, validateDurableB03Funding } from './b03DurableFundingAdapter.js'
import { validateFepPostCommitEvidence } from './b03PostCommitEvidenceAdapter.js'
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

function validatePinSet(actual) {
  if (
    !Array.isArray(actual) ||
    new Set(actual).size !== actual.length ||
    hash([...actual].sort()) !== hash([...CONTRACT_PINS.apiContractVersions].sort())
  ) {
    fail('CONTRACT_PIN_SET_MISMATCH', 'contract pins must equal the exact five A02 v0.2-draft.1 versions', 409)
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
  const identityBinding = validateA02IdentityTenant(command.context, {
    actorType: 'service',
    authorityClass: 'INTERNAL_DRAFT',
    capability: 'fep.allocation.simulate',
    purpose: 'synthetic-b07-compatibility',
  })
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
    command.target.objectVersion !== command.expectedObjectVersion ||
    command.expectedObjectVersion !== CONTRACT_PINS.allocationGenesisObjectVersion ||
    command.target.objectId !== request?.requestId
  ) {
    fail('TARGET_BINDING_MISMATCH', 'command target does not identify the exact pre-command Allocation object version', 409)
  }
  if (
    command.context.tenant.tenantId !== request.tenantId ||
    command.context.request.correlationId !== request.correlationId ||
    command.idempotencyKey !== request.idempotencyKey
  ) {
    fail('ALLOCATION_CONTEXT_DRIFT', 'allocation request does not close the A02 tenant, correlation, and idempotency context', 409)
  }
  return identityBinding
}

function engineEnvelope(input) {
  const { command, fepPostCommit } = input
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
      expiresAt: fepPostCommit.output.readback.freshness.freshUntil,
    },
    request: {
      ...source.request,
      commandContractVersion: command.contractVersion,
      readbackContractVersion: fepPostCommit.output.readback.contractVersion,
    },
    funding: source.funding,
    policy: source.policy,
    candidates: source.candidates,
  }
  return { snapshot, snapshotHash: hashAllocationSnapshot(snapshot) }
}

function validateCompatibilityInput(input, now) {
  if (Object.hasOwn(input ?? {}, 'receipt') || Object.hasOwn(input ?? {}, 'readback')) {
    fail('CALLER_PREMINTED_FINALITY_FORBIDDEN', 'Allocation input cannot contain caller-minted receipt or readback finality', 403)
  }
  assertExactKeys(input, ['pinnedContractVersions', 'command', 'fepPostCommit'], 'compatibilityInput')
  validatePinSet(input.pinnedContractVersions)
  const identityBinding = validateCommand(input.command)
  const durableFunding = validateDurableB03Funding(
    input.command.payload.allocationSnapshot.funding,
    input.command.context,
    now,
  )
  const fepPostCommit = validateFepPostCommitEvidence(
    input.fepPostCommit,
    input.command.payload.allocationSnapshot.funding,
    input.command.context,
    now,
  )
  return {
    compatibilityInputHash: hash(input),
    commandKey: `${input.command.context.tenant.tenantId}:${input.command.commandId}`,
    durableFunding,
    fepPostCommit,
    identityBinding,
  }
}

function buildReceipt(input, compatibilityInputHash, durableFunding, fepPostCommit, identityBinding) {
  const allocation = new DeterministicAllocationEngine().simulate(engineEnvelope(input)).receipt
  if (allocation.allocatedMinor !== input.command.payload.allocationSnapshot.request.requestedAmountMinor) {
    fail('ALLOCATION_BALANCE_MISMATCH', 'allocation receipt does not balance to the requested amount', 409)
  }
  const receiptBody = {
    contractVersion: CONTRACT_PINS.receiptContract,
    receiptId: `b07_${hash({ compatibilityInputHash, purpose: 'B07_A02_B03_NO_EFFECT' }).slice(0, 32)}`,
    compatibilityInputHash,
    producerPins: {
      api: `${CONTRACT_PINS.apiRepository}@${CONTRACT_PINS.apiProducerSha}`,
      apiFinalEvidenceSha: CONTRACT_PINS.apiFinalEvidenceSha,
      apiContractVersions: CONTRACT_PINS.apiContractVersions,
      apiManifestDigests: CONTRACT_PINS.apiManifestDigests,
      fep: `${CONTRACT_PINS.fepRepository}@${CONTRACT_PINS.fepJournalProducerSha}`,
      fepJournalContract: CONTRACT_PINS.fepJournalContract,
      fepPinSha256: CONTRACT_PINS.fepJournalPinSha256,
      fepSchemaSha256: CONTRACT_PINS.fepJournalSchemaSha256,
      fepMigrationSha256: CONTRACT_PINS.fepJournalMigrationSha256,
      fepRollbackSha256: CONTRACT_PINS.fepJournalRollbackSha256,
      fepJournalFixtureSha256: CONTRACT_PINS.fepJournalFixtureSha256,
      fepIdentityTenantFixtureSha256: CONTRACT_PINS.fepIdentityTenantFixtureSha256,
      localIdentityTenantFixtureSha256: CONTRACT_PINS.localIdentityTenantFixtureSha256,
      fepPr41HeadSha: CONTRACT_PINS.fepPr41HeadSha,
      fepPr41RehearsalSha256: CONTRACT_PINS.fepPr41RehearsalSha256,
      fepPr41RollbackSha256: CONTRACT_PINS.fepPr41RollbackSha256,
      fepVerifiedCi: CONTRACT_PINS.fepVerifiedCi,
    },
    evidence: {
      commandId: input.command.commandId,
      identityTenantBindingHash: identityBinding.identityTenantBindingHash,
      upstreamIdentityTenantBindingHash: fepPostCommit.identityTenantBindingHash,
      callerTenantAccepted: identityBinding.callerTenantAccepted,
      upstreamReceiptId: fepPostCommit.receiptId,
      sourceReadbackRef: fepPostCommit.sourceReadbackRef,
      fepJournalHeadHash: durableFunding.replayHeadHash,
      fepSourceReceiptHash: input.command.payload.allocationSnapshot.funding.sourceReceiptHash,
      fepAppendIndex: durableFunding.appendIndex,
      fepSourceSequence: durableFunding.sourceSequence,
      fepReceiptDisposition: durableFunding.receiptDisposition,
      fepReplayValid: durableFunding.replayValid,
      fepPreCommandObjectVersion: fepPostCommit.preCommandObjectVersion,
      fepCommittedObjectVersion: fepPostCommit.committedObjectVersion,
      fepSourceConfirmed: fepPostCommit.sourceConfirmed,
      fepBusinessFinal: fepPostCommit.businessFinal,
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
    objectVersionTransition: {
      preCommandObjectVersion: input.command.expectedObjectVersion,
      committedObjectVersion: `luzione-fep-allocation-simulation/sha256:${hash({
        compatibilityInputHash,
        allocationReceiptHash: allocation.receiptHash,
      })}`,
    },
    authority: {
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
    },
  }
  return immutableClone({ ...receiptBody, receiptHash: hash(receiptBody) })
}

export class A02B03AllocationAdapter {
  constructor() {
    this.commands = new Map()
    this.atomicClaims = new AtomicNoEffectReplayClaims(this.commands)
  }

  simulate(input, now) {
    const { compatibilityInputHash, commandKey, durableFunding, fepPostCommit, identityBinding } = validateCompatibilityInput(input, now)
    const previous = this.commands.get(commandKey)
    if (previous) {
      if (previous.inputHash !== compatibilityInputHash) {
        fail('COMMAND_REPLAY_CONFLICT', 'command id was replayed with different compatibility evidence', 409)
      }
      return immutableClone({ disposition: 'REPLAYED', receipt: previous.receipt })
    }

    const receipt = buildReceipt(input, compatibilityInputHash, durableFunding, fepPostCommit, identityBinding)
    this.commands.set(commandKey, { inputHash: compatibilityInputHash, receipt })
    return immutableClone({ disposition: 'SIMULATED', receipt })
  }

  async simulateAtomic(input, now, options = {}) {
    const { compatibilityInputHash, commandKey, durableFunding, fepPostCommit, identityBinding } = validateCompatibilityInput(input, now)
    return this.atomicClaims.transact(commandKey, compatibilityInputHash, async () => {
      const receipt = buildReceipt(input, compatibilityInputHash, durableFunding, fepPostCommit, identityBinding)
      if (options.injectFailureAfterReceipt === true) {
        fail('INJECTED_FAILURE_ROLLBACK', 'synthetic failure injected before the replay claim commit', 503)
      }
      return receipt
    })
  }

  diagnostics() {
    return immutableClone({
      committedSimulations: this.commands.size,
      replayClaims: this.commands.size,
      fepJournalWrites: 0,
      allocationWrites: 0,
      reservationWrites: 0,
      moneyEffects: 0,
      providerEffects: 0,
      runtimeActivations: 0,
      productionMigrations: 0,
    })
  }
}
