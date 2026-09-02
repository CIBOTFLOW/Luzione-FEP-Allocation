import { AllocationError, canonicalize, hash } from './canonical.js'
import { CONTRACT_PINS } from './contractPins.js'

const PROHIBITED_KEYS = new Set([
  'name',
  'full_name',
  'recipient_id',
  'case_id',
  'email',
  'phone',
  'address',
  'postal_code',
  'medical_record',
  'raw_evidence',
  'exact_diagnosis',
  'purchase_history',
  'reward_balance',
  'sponsor_affinity',
  'publicity_willingness',
  'gratitude_willingness',
  'popularity',
  'public_votes',
])

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i
const PHONE_PATTERN = /\b(?:\+?\d[\d(). -]{7,}\d)\b/
const STREET_PATTERN = /\b\d{1,6}\s+[A-Z0-9.'-]+(?:\s+[A-Z0-9.'-]+){0,4}\s+(?:STREET|ST|ROAD|RD|AVENUE|AVE|BOULEVARD|BLVD|LANE|LN|DRIVE|DR)\b/i

function fail(code, message, status = 422) {
  throw new AllocationError(code, message, status)
}

function requireString(value, field, maximum = 240) {
  if (typeof value !== 'string' || !value.trim()) fail('REQUIRED_FIELD', field + ' is required')
  const normalized = value.trim()
  if (normalized.length > maximum) fail('FIELD_TOO_LONG', field + ' is too long')
  return normalized
}

function requireHash(value, field) {
  const normalized = requireString(value, field, 64)
  if (!/^[a-f0-9]{64}$/.test(normalized)) fail('INVALID_HASH', field + ' must be a lowercase SHA-256 digest')
  return normalized
}

function requireTimestamp(value, field) {
  const normalized = requireString(value, field)
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== normalized) {
    fail('INVALID_TIMESTAMP', field + ' must be a canonical ISO timestamp')
  }
  return parsed
}

function requirePositiveMinor(value, field) {
  if (!Number.isSafeInteger(value) || value <= 0) fail('INVALID_AMOUNT', field + ' must be positive integer minor units')
  return value
}

function scanPrivateData(value, path = 'snapshot') {
  if (Array.isArray(value)) return value.flatMap((child, index) => scanPrivateData(child, `${path}[${index}]`))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => [
      ...(PROHIBITED_KEYS.has(key.toLowerCase()) ? [`${path}.${key}`] : []),
      ...scanPrivateData(child, `${path}.${key}`),
    ])
  }
  if (typeof value !== 'string') return []
  if (/^[a-f0-9]{40,64}$/i.test(value)) return []
  const findings = []
  if (EMAIL_PATTERN.test(value)) findings.push(path + ':email')
  if (PHONE_PATTERN.test(value)) findings.push(path + ':phone')
  if (STREET_PATTERN.test(value)) findings.push(path + ':street-address')
  return findings
}

function normalizedCandidates(candidates) {
  if (!Array.isArray(candidates) || candidates.length < 2) fail('CANDIDATES_REQUIRED', 'at least two eligible references are required')
  const seen = new Set()
  return candidates.map((candidate) => {
    const eligibilityRef = requireString(candidate.eligibilityRef, 'candidate.eligibilityRef', 80)
    if (!/^elig_[a-f0-9]{12,64}$/.test(eligibilityRef)) {
      fail('ELIGIBILITY_REFERENCE_INVALID', 'eligibilityRef must be an opaque, non-identifying reference')
    }
    if (seen.has(eligibilityRef)) fail('DUPLICATE_ELIGIBILITY_REFERENCE', 'eligible population contains a duplicate reference')
    seen.add(eligibilityRef)
    if (!Number.isSafeInteger(candidate.priorityUnits) || candidate.priorityUnits < 1 || candidate.priorityUnits > 1_000_000) {
      fail('PRIORITY_UNITS_INVALID', 'priorityUnits must be an integer between 1 and 1000000')
    }
    return {
      eligibilityRef,
      priorityUnits: candidate.priorityUnits,
      maximumAllocationMinor: requirePositiveMinor(candidate.maximumAllocationMinor, 'candidate.maximumAllocationMinor'),
      fairnessGroup: requireString(candidate.fairnessGroup, 'candidate.fairnessGroup', 80),
    }
  }).sort((left, right) => left.eligibilityRef.localeCompare(right.eligibilityRef))
}

function normalizeSnapshot(snapshot) {
  return canonicalize({ ...snapshot, candidates: normalizedCandidates(snapshot.candidates) })
}

export function hashAllocationSnapshot(snapshot) {
  return hash(normalizeSnapshot(snapshot))
}

function validatePins(snapshot) {
  if (snapshot.schemaVersion !== CONTRACT_PINS.adapterContract || snapshot.effectMode !== CONTRACT_PINS.effectMode) {
    fail('ADAPTER_CONTRACT_MISMATCH', 'allocation input must use the pinned effect-disabled adapter contract', 409)
  }
  if (
    snapshot.identity.contractVersion !== CONTRACT_PINS.identityContract ||
    snapshot.request.commandContractVersion !== CONTRACT_PINS.commandContract ||
    snapshot.request.readbackContractVersion !== CONTRACT_PINS.readbackContract
  ) {
    fail('API_CONTRACT_MISMATCH', 'identity, command, and readback contracts must match the explicit API pins', 409)
  }
  if (
    snapshot.funding.contractVersion !== CONTRACT_PINS.fepJournalContract ||
    snapshot.funding.producerSha !== CONTRACT_PINS.fepJournalProducerSha ||
    snapshot.funding.schemaSha256 !== CONTRACT_PINS.fepJournalSchemaSha256 ||
    snapshot.policy.contractVersion !== CONTRACT_PINS.fepPolicyContract
  ) {
    fail('FEP_CONTRACT_MISMATCH', 'funding and policy inputs must match the explicit FEP pins', 409)
  }
}

function validateAuthority(snapshot) {
  const runAt = requireTimestamp(snapshot.runAt, 'runAt')
  const identityExpiry = requireTimestamp(snapshot.identity.expiresAt, 'identity.expiresAt')
  const fundingAsOf = requireTimestamp(snapshot.funding.asOf, 'funding.asOf')
  const policyValidUntil = requireTimestamp(snapshot.policy.validUntil, 'policy.validUntil')
  if (snapshot.identity.tenantId !== snapshot.request.tenantId) fail('TENANT_ACCESS_DENIED', 'identity tenant does not match request tenant', 403)
  if (!Array.isArray(snapshot.identity.scopes) || !snapshot.identity.scopes.includes('allocation:simulate')) {
    fail('SCOPE_REQUIRED', 'allocation:simulate scope is required', 403)
  }
  if (identityExpiry <= runAt) fail('IDENTITY_EXPIRED', 'identity expired before the simulation run', 401)
  if (policyValidUntil <= runAt) fail('POLICY_STALE', 'policy expired before the simulation run', 409)
  if (runAt.getTime() - fundingAsOf.getTime() > 15 * 60 * 1000 || fundingAsOf > runAt) {
    fail('FUNDING_SNAPSHOT_STALE', 'funding projection must be no more than 15 minutes old and not from the future', 409)
  }
  if (snapshot.request.currency !== snapshot.funding.currency) fail('CURRENCY_MISMATCH', 'request and funding currencies differ', 409)
  if (!/^[A-Z]{3}$/.test(snapshot.request.currency)) fail('INVALID_CURRENCY', 'currency must use an uppercase ISO code')
  const requested = requirePositiveMinor(snapshot.request.requestedAmountMinor, 'request.requestedAmountMinor')
  const available = requirePositiveMinor(snapshot.funding.availableMinor, 'funding.availableMinor')
  if (requested > available) fail('INSUFFICIENT_FEP_PROJECTION', 'requested allocation exceeds the FEP-reported projection', 409)
  requireHash(snapshot.identity.actorIdHash, 'identity.actorIdHash')
  requireHash(snapshot.funding.journalHeadHash, 'funding.journalHeadHash')
  requireHash(snapshot.funding.sourceReceiptHash, 'funding.sourceReceiptHash')
  requireHash(snapshot.policy.policyHash, 'policy.policyHash')
  requireHash(snapshot.policy.eligiblePopulationHash, 'policy.eligiblePopulationHash')
}

function allocateWeighted(candidates, requestedAmountMinor) {
  const allocations = new Map(candidates.map((candidate) => [candidate.eligibilityRef, 0]))
  let remaining = requestedAmountMinor
  while (remaining > 0) {
    const active = candidates.filter((candidate) => allocations.get(candidate.eligibilityRef) < candidate.maximumAllocationMinor)
    if (!active.length) fail('CANDIDATE_CAPACITY_INSUFFICIENT', 'candidate caps cannot absorb the requested allocation', 409)
    const totalWeight = active.reduce((sum, candidate) => sum + candidate.priorityUnits, 0)
    const shares = active.map((candidate) => {
      const numerator = remaining * candidate.priorityUnits
      if (!Number.isSafeInteger(numerator)) fail('ALLOCATION_OVERFLOW', 'weighted allocation exceeds safe integer range')
      const capacity = candidate.maximumAllocationMinor - allocations.get(candidate.eligibilityRef)
      return {
        candidate,
        amount: Math.min(capacity, Math.floor(numerator / totalWeight)),
        remainder: numerator % totalWeight,
      }
    })
    let applied = 0
    for (const share of shares) {
      if (!share.amount) continue
      allocations.set(share.candidate.eligibilityRef, allocations.get(share.candidate.eligibilityRef) + share.amount)
      applied += share.amount
    }
    remaining -= applied
    if (remaining <= 0) break
    const remainderOrder = shares
      .filter((share) => allocations.get(share.candidate.eligibilityRef) < share.candidate.maximumAllocationMinor)
      .sort((left, right) => right.remainder - left.remainder || left.candidate.eligibilityRef.localeCompare(right.candidate.eligibilityRef))
    if (!remainderOrder.length) continue
    for (const share of remainderOrder) {
      if (remaining <= 0) break
      allocations.set(share.candidate.eligibilityRef, allocations.get(share.candidate.eligibilityRef) + 1)
      remaining -= 1
    }
  }
  return candidates.map((candidate) => ({ ...candidate, amountMinor: allocations.get(candidate.eligibilityRef) }))
}

function fairnessDiagnostics(allocations, minimumGroupSize) {
  if (!Number.isSafeInteger(minimumGroupSize) || minimumGroupSize < 2) {
    fail('FAIRNESS_MINIMUM_INVALID', 'minimumGroupSize must be an integer of at least 2')
  }
  const groups = new Map()
  for (const allocation of allocations) {
    const group = groups.get(allocation.fairnessGroup) ?? { candidateCount: 0, allocatedMinor: 0 }
    group.candidateCount += 1
    group.allocatedMinor += allocation.amountMinor
    groups.set(allocation.fairnessGroup, group)
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([groupName, group]) =>
    group.candidateCount < minimumGroupSize
      ? { groupHash: hash({ groupName }), suppressed: true, minimumGroupSize }
      : {
          groupHash: hash({ groupName }),
          suppressed: false,
          candidateCount: group.candidateCount,
          allocatedMinor: group.allocatedMinor,
          averageAllocationMinor: Math.floor(group.allocatedMinor / group.candidateCount),
        }
  )
}

export class DeterministicAllocationEngine {
  constructor() {
    this.idempotency = new Map()
  }

  simulate(envelope) {
    const privateFindings = scanPrivateData(envelope)
    if (privateFindings.length) fail('PRIVATE_DATA_PROHIBITED', 'allocation snapshot contains prohibited data: ' + privateFindings.join(', '), 403)
    const snapshot = normalizeSnapshot(envelope.snapshot)
    const snapshotHash = hash(snapshot)
    if (envelope.snapshotHash !== snapshotHash) fail('SNAPSHOT_HASH_MISMATCH', 'allocation snapshot hash does not match', 409)
    validatePins(snapshot)
    validateAuthority(snapshot)

    const idempotencyKey = requireString(snapshot.request.idempotencyKey, 'request.idempotencyKey', 200)
    const scopedKey = `${snapshot.request.tenantId}:${idempotencyKey}`
    const replay = this.idempotency.get(scopedKey)
    if (replay) {
      if (replay.snapshotHash !== snapshotHash) fail('IDEMPOTENCY_CONFLICT', 'idempotency key was reused with a different allocation snapshot', 409)
      return { disposition: 'REPLAYED', receipt: structuredClone(replay.receipt) }
    }

    const weighted = allocateWeighted(snapshot.candidates, snapshot.request.requestedAmountMinor)
    const allocations = weighted.map((allocation) => ({
      eligibilityRef: allocation.eligibilityRef,
      amountMinor: allocation.amountMinor,
      currency: snapshot.request.currency,
      reasonCodes: ['DETERMINISTIC_WEIGHTED_SHARE', 'FEP_POLICY_PINNED'],
      appeal: {
        supported: true,
        authority: 'FEP_PLATFORM',
        adapterCanResolve: false,
        referenceHash: hash({
          eligibilityRef: allocation.eligibilityRef,
          policyHash: snapshot.policy.policyHash,
          purpose: 'FEP_APPEAL',
        }),
      },
    }))
    const receiptBody = {
      contractVersion: CONTRACT_PINS.receiptContract,
      receiptId: `allocation_${hash({ snapshotHash, purpose: 'B07_SIMULATION' }).slice(0, 32)}`,
      snapshotHash,
      tenantId: snapshot.request.tenantId,
      requestId: snapshot.request.requestId,
      correlationId: snapshot.request.correlationId,
      policyVersion: snapshot.policy.policyVersion,
      policyHash: snapshot.policy.policyHash,
      eligiblePopulationHash: snapshot.policy.eligiblePopulationHash,
      fepJournal: {
        contractVersion: snapshot.funding.contractVersion,
        producerSha: snapshot.funding.producerSha,
        journalHeadHash: snapshot.funding.journalHeadHash,
      },
      allocatedMinor: allocations.reduce((sum, allocation) => sum + allocation.amountMinor, 0),
      currency: snapshot.request.currency,
      allocations,
      fairness: {
        decisionUsesFairnessGroup: false,
        groups: fairnessDiagnostics(weighted, snapshot.policy.minimumGroupSize),
      },
      runAt: snapshot.runAt,
      effectMode: 'DISABLED',
      authority: {
        writeFepJournal: false,
        moveMoney: false,
        approveOrDeny: false,
        selectNamedRecipientForSponsor: false,
      },
    }
    const receipt = { ...receiptBody, receiptHash: hash(receiptBody) }
    this.idempotency.set(scopedKey, { snapshotHash, receipt: structuredClone(receipt) })
    return { disposition: 'SIMULATED', receipt }
  }
}

export { scanPrivateData }
