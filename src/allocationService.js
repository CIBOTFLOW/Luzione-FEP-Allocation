import { AllocationError, hash, uid } from './canonical.js'

const ALLOWED_DIMENSIONS = new Set([
  'ECONOMIC_HARDSHIP_BAND',
  'HOUSEHOLD_TYPE',
  'AGE_BAND',
  'CONDITION_GROUP',
  'DISABILITY_SUPPORT_NEED',
  'WORK_STATUS_CONTEXT',
  'EDUCATION_STAGE',
  'DIETARY_RESTRICTION',
  'GENERALIZED_GEOGRAPHY',
  'CASE_CATEGORY',
])

const PROHIBITED_KEYS = new Set([
  'full_name',
  'exact_name',
  'person_name',
  'recipient_name',
  'recipient_id',
  'case_id',
  'email',
  'phone',
  'exact_address',
  'street_address',
  'postal_code',
  'medical_record',
  'raw_evidence',
  'exact_diagnosis',
  'social_security_number',
  'reward_balance',
  'purchase_history',
  'publicity_willingness',
  'gratitude_willingness',
  'sponsor_affinity',
  'popularity',
  'public_votes',
])

const PUBLIC_CARD_KEYS = new Set([
  'publicCode',
  'category',
  'headline',
  'generalizedRegion',
  'approvedCohortTags',
  'requestedAmountMinor',
  'currency',
  'summary',
  'consentVerified',
  'reviewPolicyVersion',
])

const ROLE_PERMISSIONS = {
  VIEWER: new Set(['VIEW']),
  PLANNER: new Set(['VIEW', 'CREATE_INTENT', 'CONFIGURE_PROGRAM']),
  ADMIN: new Set(['VIEW', 'CREATE_INTENT', 'CONFIGURE_PROGRAM', 'VIEW_AUDIT']),
}

const HELD_INTENT_STATUSES = new Set([
  'SUBMITTED_FOR_FEP_REVIEW',
  'ACCEPTED_BY_FEP_AWAITING_PROJECTION',
])

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i
const PHONE_PATTERN = /\b(?:\+?\d[\d(). -]{7,}\d)\b/
const STREET_PATTERN = /\b\d{1,6}\s+[A-Z0-9.'-]+(?:\s+[A-Z0-9.'-]+){0,4}\s+(?:STREET|ST|ROAD|RD|AVENUE|AVE|BOULEVARD|BLVD|LANE|LN|DRIVE|DR)\b/i

function scan(value, path = 'root') {
  if (Array.isArray(value)) return value.flatMap((item, index) => scan(item, path + '[' + index + ']'))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => [
      ...(PROHIBITED_KEYS.has(key.toLowerCase()) ? [path + '.' + key] : []),
      ...scan(child, path + '.' + key),
    ])
  }
  if (typeof value === 'string') {
    const findings = []
    if (EMAIL_PATTERN.test(value)) findings.push(path + ':email')
    if (PHONE_PATTERN.test(value)) findings.push(path + ':phone')
    if (STREET_PATTERN.test(value)) findings.push(path + ':street-address')
    return findings
  }
  return []
}

function positiveMinor(value, field) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new AllocationError('INVALID_AMOUNT', field + ' must be positive integer minor units')
  }
  return value
}

function nonNegativeMinor(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AllocationError('INVALID_AMOUNT', field + ' must be non-negative integer minor units')
  }
  return value
}

function required(value, field, maximum = 300) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AllocationError('REQUIRED_FIELD', field + ' is required')
  }
  const normalized = value.trim()
  if (normalized.length > maximum) throw new AllocationError('FIELD_TOO_LONG', field + ' is too long')
  return normalized
}

function currency(value) {
  const normalized = required(value, 'currency', 3).toUpperCase()
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new AllocationError('INVALID_CURRENCY', 'currency must use a three-letter code')
  }
  return normalized
}

function timestamp(value, field) {
  const normalized = required(value, field)
  if (Number.isNaN(Date.parse(normalized))) {
    throw new AllocationError('INVALID_TIMESTAMP', field + ' must be an ISO timestamp')
  }
  return new Date(normalized).toISOString()
}

function publicCardView(card) {
  return {
    publicCode: card.publicCode,
    category: card.category,
    headline: card.headline,
    generalizedRegion: card.generalizedRegion,
    approvedCohortTags: [...card.approvedCohortTags],
    requestedAmountMinor: card.requestedAmountMinor,
    currency: card.currency,
    summary: card.summary,
    status: card.status,
  }
}

export function createFixtureFepReceipt({
  contractVersion,
  resourceType,
  resourceId,
  payload,
  outcome = 'PUBLISHED',
  receiptId = uid('fepreceipt'),
  issuedAt = new Date().toISOString(),
}) {
  const body = {
    authority: 'FEP_PLATFORM',
    contractVersion,
    resourceType,
    resourceId,
    outcome,
    payloadHash: hash(payload),
    receiptId,
    issuedAt,
    signature: 'DEMO_VERIFIED_BY_INJECTED_FIXTURE_VERIFIER',
  }
  return { ...body, receiptHash: hash(body) }
}

export class AllocationService {
  constructor({
    minimumCohortSize = 10,
    now = () => new Date(),
    verifyFepReceipt = () => false,
  } = {}) {
    this.minimumCohortSize = minimumCohortSize
    this.now = now
    this.verifyFepReceipt = verifyFepReceipt
    this.organizations = new Map()
    this.memberships = new Map()
    this.programs = new Map()
    this.cohorts = new Map()
    this.cards = new Map()
    this.intents = new Map()
    this.impact = new Map()
    this.audit = []
    this.idempotency = new Map()
    this.fepReceipts = new Map()
  }

  createOrganization({ code, name, currency: currencyCode = 'USD' }) {
    const normalizedCode = required(code, 'code', 80).toUpperCase()
    if (this.organizations.has(normalizedCode)) {
      throw new AllocationError('SPONSOR_EXISTS', 'sponsor already exists', 409)
    }
    const organization = {
      organizationId: uid('org'),
      code: normalizedCode,
      name: required(name, 'name', 200),
      currency: currency(currencyCode),
      status: 'ACTIVE',
      fepReportedAvailableAllocationMinor: 0,
      fepProjectionVersion: 0,
      fepProjectionHash: null,
      fepProjectionAsOf: null,
    }
    this.organizations.set(normalizedCode, organization)
    return { ...organization }
  }

  addMembership({ sponsorCode, subjectId, role }) {
    const code = required(sponsorCode, 'sponsorCode', 80).toUpperCase()
    if (!this.organizations.has(code)) {
      throw new AllocationError('SPONSOR_NOT_FOUND', 'sponsor not found', 404)
    }
    const normalizedRole = required(role, 'role', 40).toUpperCase()
    if (!ROLE_PERMISSIONS[normalizedRole]) {
      throw new AllocationError('INVALID_ROLE', 'role is not supported')
    }
    const membership = {
      membershipId: uid('membership'),
      sponsorCode: code,
      subjectId: required(subjectId, 'subjectId', 200),
      role: normalizedRole,
      status: 'ACTIVE',
    }
    this.memberships.set(code + ':' + membership.subjectId, membership)
    return { ...membership }
  }

  actor(sponsorCode, subjectId) {
    return { sponsorCode: sponsorCode.toUpperCase(), subjectId }
  }

  authorize(actor, sponsorCode, permission) {
    if (!actor || typeof actor !== 'object') {
      throw new AllocationError('AUTHENTICATION_REQUIRED', 'authenticated actor is required', 401)
    }
    const code = required(sponsorCode, 'sponsorCode', 80).toUpperCase()
    if (actor.sponsorCode !== code) {
      throw new AllocationError('TENANT_ACCESS_DENIED', 'resource is not visible', 403)
    }
    const membership = this.memberships.get(code + ':' + actor.subjectId)
    if (!membership || membership.status !== 'ACTIVE') {
      throw new AllocationError('MEMBERSHIP_REQUIRED', 'active sponsor membership is required', 403)
    }
    if (!ROLE_PERMISSIONS[membership.role]?.has(permission)) {
      throw new AllocationError('ROLE_ACCESS_DENIED', 'membership role cannot perform this action', 403)
    }
    return membership
  }

  auditEvent({ actor, sponsorCode, action, resourceType, resourceId = null, details = {} }) {
    const event = {
      eventId: uid('audit'),
      sponsorCode,
      actorSubjectHash: hash({ subjectId: actor.subjectId }),
      action,
      resourceType,
      resourceId,
      details,
      occurredAt: this.now().toISOString(),
    }
    this.audit.push(event)
    return event
  }

  consumeFepReceipt(receipt, { contractVersion, resourceType, resourceId, payload }) {
    if (!receipt || typeof receipt !== 'object') {
      throw new AllocationError('FEP_RECEIPT_REQUIRED', 'verified FEP receipt is required', 401)
    }
    if (receipt.authority !== 'FEP_PLATFORM') {
      throw new AllocationError('INVALID_FEP_AUTHORITY', 'receipt authority must be FEP Platform', 403)
    }
    if (receipt.contractVersion !== contractVersion) {
      throw new AllocationError('FEP_CONTRACT_MISMATCH', 'unexpected FEP contract version', 409)
    }
    if (receipt.resourceType !== resourceType || receipt.resourceId !== resourceId) {
      throw new AllocationError('FEP_RESOURCE_MISMATCH', 'receipt resource binding does not match', 409)
    }
    timestamp(receipt.issuedAt, 'receipt.issuedAt')
    if (receipt.payloadHash !== hash(payload)) {
      throw new AllocationError('FEP_PAYLOAD_HASH_MISMATCH', 'receipt payload hash does not match', 409)
    }
    const body = { ...receipt }
    delete body.receiptHash
    if (receipt.receiptHash !== hash(body)) {
      throw new AllocationError('FEP_RECEIPT_HASH_MISMATCH', 'receipt hash does not match', 409)
    }
    if (!this.verifyFepReceipt(receipt)) {
      throw new AllocationError('FEP_SIGNATURE_UNVERIFIED', 'FEP receipt signature was not verified', 401)
    }
    const existing = this.fepReceipts.get(receipt.receiptId)
    if (existing) {
      if (existing.receiptHash !== receipt.receiptHash) {
        throw new AllocationError('FEP_RECEIPT_CONFLICT', 'receipt id was reused with different content', 409)
      }
      return { replay: true, receipt: existing }
    }
    return { replay: false, receipt }
  }

  commitFepReceipt(receipt) {
    this.fepReceipts.set(receipt.receiptId, { ...receipt })
  }

  recordFepAllocationProjection(sponsorCode, input, receipt) {
    const code = required(sponsorCode, 'sponsorCode', 80).toUpperCase()
    const organization = this.organizations.get(code)
    if (!organization) throw new AllocationError('SPONSOR_NOT_FOUND', 'sponsor not found', 404)
    const projection = {
      projectionVersion: input.projectionVersion,
      settledAllocationMinor: nonNegativeMinor(input.settledAllocationMinor, 'settledAllocationMinor'),
      committedAllocationMinor: nonNegativeMinor(input.committedAllocationMinor, 'committedAllocationMinor'),
      currency: currency(input.currency),
      acceptedIntentIds: [...new Set(input.acceptedIntentIds ?? [])].sort(),
      asOf: timestamp(input.asOf, 'asOf'),
    }
    if (!Number.isSafeInteger(projection.projectionVersion) || projection.projectionVersion < 1) {
      throw new AllocationError('INVALID_PROJECTION_VERSION', 'projectionVersion must be an integer >= 1')
    }
    if (projection.committedAllocationMinor > projection.settledAllocationMinor) {
      throw new AllocationError('INVALID_PROJECTION', 'committed allocation cannot exceed settled allocation')
    }
    if (projection.currency !== organization.currency) {
      throw new AllocationError('CURRENCY_MISMATCH', 'projection currency does not match sponsor')
    }
    const consumed = this.consumeFepReceipt(receipt, {
      contractVersion: 'fep-allocation-balance-v1',
      resourceType: 'SPONSOR_ALLOCATION',
      resourceId: code,
      payload: projection,
    })
    if (consumed.replay) return this.getOverviewInternal(code)
    if (projection.projectionVersion <= organization.fepProjectionVersion) {
      throw new AllocationError('STALE_FEP_PROJECTION', 'projection version must advance', 409)
    }
    for (const intentId of projection.acceptedIntentIds) {
      const intent = this.intents.get(intentId)
      if (!intent || intent.sponsorCode !== code || intent.status !== 'ACCEPTED_BY_FEP_AWAITING_PROJECTION') {
        throw new AllocationError('INVALID_RECONCILED_INTENT', 'projection references an unavailable accepted intent', 409)
      }
    }
    organization.fepReportedAvailableAllocationMinor =
      projection.settledAllocationMinor - projection.committedAllocationMinor
    organization.fepProjectionVersion = projection.projectionVersion
    organization.fepProjectionHash = receipt.payloadHash
    organization.fepProjectionAsOf = projection.asOf
    for (const intentId of projection.acceptedIntentIds) {
      this.intents.get(intentId).status = 'ACCEPTED_BY_FEP_RECONCILED'
    }
    this.commitFepReceipt(receipt)
    return this.getOverviewInternal(code)
  }

  createProgram(input) {
    const code = required(input.sponsorCode, 'sponsorCode', 80).toUpperCase()
    this.authorize(input.actor, code, 'CONFIGURE_PROGRAM')
    if (!Array.isArray(input.allowedCategories) || !input.allowedCategories.length) {
      throw new AllocationError('CATEGORIES_REQUIRED', 'program requires allowed categories')
    }
    const program = {
      programId: uid('program'),
      sponsorCode: code,
      name: required(input.name, 'name', 200),
      allowedCategories: [...new Set(input.allowedCategories.map((item) => required(item, 'category', 80).toUpperCase()))],
      allowedRegions: [...new Set((input.allowedRegions ?? []).map((item) => required(item, 'region', 120)))],
      currency: currency(input.currency ?? this.organizations.get(code).currency),
      status: 'DRAFT',
      createdAt: this.now().toISOString(),
    }
    this.programs.set(program.programId, program)
    this.auditEvent({ actor: input.actor, sponsorCode: code, action: 'CREATE_PROGRAM_DRAFT', resourceType: 'PROGRAM', resourceId: program.programId })
    return { ...program }
  }

  submitProgram(actor, programId) {
    const program = this.programs.get(programId)
    if (!program) throw new AllocationError('PROGRAM_NOT_FOUND', 'program not found', 404)
    this.authorize(actor, program.sponsorCode, 'CONFIGURE_PROGRAM')
    if (program.status !== 'DRAFT') throw new AllocationError('PROGRAM_STATE_CONFLICT', 'only draft programs can be submitted', 409)
    program.status = 'SUBMITTED_FOR_FEP_REVIEW'
    this.auditEvent({ actor, sponsorCode: program.sponsorCode, action: 'SUBMIT_PROGRAM', resourceType: 'PROGRAM', resourceId: programId })
    return { ...program }
  }

  recordFepProgramDisposition(programId, input, receipt) {
    const program = this.programs.get(programId)
    if (!program) throw new AllocationError('PROGRAM_NOT_FOUND', 'program not found', 404)
    const disposition = {
      outcome: input.outcome,
      policyVersion: required(input.policyVersion, 'policyVersion', 120),
      reasonCode: input.reasonCode ?? null,
    }
    if (!['ACCEPTED', 'REJECTED'].includes(disposition.outcome)) {
      throw new AllocationError('INVALID_DISPOSITION', 'program outcome must be ACCEPTED or REJECTED')
    }
    const consumed = this.consumeFepReceipt(receipt, {
      contractVersion: 'fep-program-disposition-v1',
      resourceType: 'PROGRAM',
      resourceId: programId,
      payload: disposition,
    })
    if (consumed.replay) return { ...program }
    if (program.status !== 'SUBMITTED_FOR_FEP_REVIEW') {
      throw new AllocationError('PROGRAM_STATE_CONFLICT', 'program is not awaiting FEP review', 409)
    }
    program.status = disposition.outcome === 'ACCEPTED' ? 'ACTIVE' : 'REJECTED_BY_FEP'
    program.fepPolicyVersion = disposition.policyVersion
    program.fepDispositionReceiptId = receipt.receiptId
    this.commitFepReceipt(receipt)
    return { ...program }
  }

  publishReviewedCohort(input, receipt) {
    const program = this.programs.get(input.programId)
    if (!program || program.status !== 'ACTIVE') {
      throw new AllocationError('PROGRAM_NOT_ACTIVE', 'cohort program is not active', 409)
    }
    const invalid = (input.dimensions ?? []).filter((dimension) => !ALLOWED_DIMENSIONS.has(dimension))
    if (invalid.length) {
      throw new AllocationError('UNAPPROVED_DIMENSION', 'unapproved cohort dimensions: ' + invalid.join(', '))
    }
    const forbidden = scan(input.criteria)
    if (forbidden.length) {
      throw new AllocationError('PROHIBITED_CRITERIA', 'prohibited criteria: ' + forbidden.join(', '))
    }
    if (!Number.isSafeInteger(input.eligibleCount) || input.eligibleCount < this.minimumCohortSize) {
      throw new AllocationError('COHORT_TOO_SMALL', 'reviewed cohort does not meet the minimum privacy threshold', 409)
    }
    const cohort = {
      cohortId: required(input.cohortId, 'cohortId', 160),
      programId: input.programId,
      version: input.version,
      name: required(input.name, 'name', 200),
      dimensions: [...input.dimensions],
      criteria: input.criteria,
      eligibleCount: input.eligibleCount,
      status: 'APPROVED',
      contentHash: hash(input),
    }
    const consumed = this.consumeFepReceipt(receipt, {
      contractVersion: 'fep-reviewed-cohort-v1',
      resourceType: 'COHORT',
      resourceId: cohort.cohortId,
      payload: cohort,
    })
    if (consumed.replay) return { ...this.cohorts.get(cohort.cohortId) }
    this.cohorts.set(cohort.cohortId, cohort)
    this.commitFepReceipt(receipt)
    return { ...cohort }
  }

  publishPublicCardProjection(input, receipt) {
    const extraKeys = Object.keys(input).filter((key) => !PUBLIC_CARD_KEYS.has(key))
    if (extraKeys.length) {
      throw new AllocationError('PRIVATE_FIELD_PROHIBITED', 'public card contains unapproved fields: ' + extraKeys.join(', '))
    }
    const forbidden = scan(input)
    if (forbidden.length) {
      throw new AllocationError('PRIVATE_FIELD_PROHIBITED', 'public card contains prohibited data: ' + forbidden.join(', '))
    }
    if (input.consentVerified !== true) throw new AllocationError('CONSENT_REQUIRED', 'public card requires verified consent')
    required(input.reviewPolicyVersion, 'reviewPolicyVersion', 120)
    const card = {
      publicCode: required(input.publicCode, 'publicCode', 120),
      category: required(input.category, 'category', 80).toUpperCase(),
      headline: required(input.headline, 'headline', 180),
      generalizedRegion: required(input.generalizedRegion, 'generalizedRegion', 120),
      approvedCohortTags: [...new Set(input.approvedCohortTags ?? [])],
      requestedAmountMinor: positiveMinor(input.requestedAmountMinor, 'requestedAmountMinor'),
      currency: currency(input.currency),
      summary: required(input.summary, 'summary', 600),
      consentVerified: true,
      reviewPolicyVersion: input.reviewPolicyVersion,
      status: 'PUBLISHED',
    }
    const consumed = this.consumeFepReceipt(receipt, {
      contractVersion: 'fep-public-case-card-v1',
      resourceType: 'PUBLIC_CASE_CARD',
      resourceId: card.publicCode,
      payload: card,
    })
    if (consumed.replay) return publicCardView(this.cards.get(card.publicCode))
    this.cards.set(card.publicCode, card)
    this.commitFepReceipt(receipt)
    return publicCardView(card)
  }

  listPrograms({ actor, sponsorCode }) {
    const code = required(sponsorCode, 'sponsorCode', 80).toUpperCase()
    this.authorize(actor, code, 'VIEW')
    this.auditEvent({ actor, sponsorCode: code, action: 'VIEW_PROGRAMS', resourceType: 'PROGRAM_LIST' })
    return [...this.programs.values()].filter((program) => program.sponsorCode === code).map((program) => ({ ...program }))
  }

  listCohorts({ actor, sponsorCode, programId }) {
    const code = required(sponsorCode, 'sponsorCode', 80).toUpperCase()
    this.authorize(actor, code, 'VIEW')
    const program = this.programs.get(programId)
    if (!program || program.sponsorCode !== code) throw new AllocationError('PROGRAM_ACCESS_DENIED', 'program not visible', 403)
    this.auditEvent({ actor, sponsorCode: code, action: 'VIEW_COHORTS', resourceType: 'COHORT_LIST', resourceId: programId })
    return [...this.cohorts.values()].filter((cohort) => cohort.programId === programId).map((cohort) => ({
      cohortId: cohort.cohortId,
      programId: cohort.programId,
      version: cohort.version,
      name: cohort.name,
      dimensions: [...cohort.dimensions],
      eligibleCount: cohort.eligibleCount,
      status: cohort.status,
    }))
  }

  listCards({ actor, sponsorCode, programId, cohortId = null }) {
    const code = required(sponsorCode, 'sponsorCode', 80).toUpperCase()
    this.authorize(actor, code, 'VIEW')
    const program = this.programs.get(programId)
    if (!program || program.sponsorCode !== code || program.status !== 'ACTIVE') {
      throw new AllocationError('PROGRAM_ACCESS_DENIED', 'program not visible', 403)
    }
    const cohort = cohortId ? this.cohorts.get(cohortId) : null
    if (cohortId && (!cohort || cohort.programId !== programId || cohort.status !== 'APPROVED')) {
      throw new AllocationError('COHORT_NOT_APPROVED', 'cohort not available', 409)
    }
    this.auditEvent({
      actor,
      sponsorCode: code,
      action: 'VIEW_OPPORTUNITIES',
      resourceType: 'PUBLIC_CASE_CARD_LIST',
      resourceId: programId,
      details: { cohortId },
    })
    return [...this.cards.values()]
      .filter((card) =>
        card.status === 'PUBLISHED' &&
        program.allowedCategories.includes(card.category) &&
        (!program.allowedRegions.length || program.allowedRegions.includes(card.generalizedRegion)) &&
        (!cohort || cohort.dimensions.every((dimension) =>
          card.approvedCohortTags.includes(dimension + ':' + cohort.criteria[dimension])
        ))
      )
      .map(publicCardView)
  }

  heldIntentMinor(sponsorCode) {
    return [...this.intents.values()]
      .filter((intent) => intent.sponsorCode === sponsorCode && HELD_INTENT_STATUSES.has(intent.status))
      .reduce((total, intent) => total + intent.amountMinor, 0)
  }

  getOverviewInternal(sponsorCode) {
    const organization = this.organizations.get(sponsorCode)
    const heldIntentMinor = this.heldIntentMinor(sponsorCode)
    return {
      sponsorCode,
      currency: organization.currency,
      fepReportedAvailableAllocationMinor: organization.fepReportedAvailableAllocationMinor,
      heldIntentMinor,
      intentableAllocationMinor: Math.max(0, organization.fepReportedAvailableAllocationMinor - heldIntentMinor),
      fepProjectionVersion: organization.fepProjectionVersion,
      fepProjectionAsOf: organization.fepProjectionAsOf,
      activeProgramCount: [...this.programs.values()].filter((program) =>
        program.sponsorCode === sponsorCode && program.status === 'ACTIVE'
      ).length,
      pendingIntentCount: [...this.intents.values()].filter((intent) =>
        intent.sponsorCode === sponsorCode && HELD_INTENT_STATUSES.has(intent.status)
      ).length,
      authoritative: false,
      authoritySource: 'FEP_PLATFORM_PROJECTION',
    }
  }

  getOverview({ actor, sponsorCode }) {
    const code = required(sponsorCode, 'sponsorCode', 80).toUpperCase()
    this.authorize(actor, code, 'VIEW')
    this.auditEvent({ actor, sponsorCode: code, action: 'VIEW_OVERVIEW', resourceType: 'SPONSOR_OVERVIEW' })
    return this.getOverviewInternal(code)
  }

  createAllocationIntent(input) {
    const code = required(input.sponsorCode, 'sponsorCode', 80).toUpperCase()
    this.authorize(input.actor, code, 'CREATE_INTENT')
    if (input.targetType === 'PUBLIC_CASE_CARD' || input.publicCode || input.caseId || input.recipientId) {
      throw new AllocationError(
        'NAMED_RECIPIENT_TARGET_PROHIBITED',
        'sponsors may fund approved programs or broad reviewed cohorts, never named recipients',
        403,
      )
    }
    if (!['PROGRAM', 'COHORT'].includes(input.targetType)) {
      throw new AllocationError('INVALID_TARGET', 'target must be PROGRAM or COHORT')
    }
    const amountMinor = positiveMinor(input.amountMinor, 'amountMinor')
    const organization = this.organizations.get(code)
    const program = this.programs.get(input.programId)
    if (!program || program.sponsorCode !== code || program.status !== 'ACTIVE') {
      throw new AllocationError('PROGRAM_ACCESS_DENIED', 'program not visible', 403)
    }
    if (program.currency !== organization.currency) {
      throw new AllocationError('CURRENCY_MISMATCH', 'program currency does not match sponsor')
    }
    let targetRef = program.programId
    if (input.targetType === 'COHORT') {
      const cohort = this.cohorts.get(input.cohortId)
      if (!cohort || cohort.programId !== program.programId || cohort.status !== 'APPROVED') {
        throw new AllocationError('COHORT_NOT_APPROVED', 'cohort not approved', 409)
      }
      if (cohort.eligibleCount < this.minimumCohortSize) {
        throw new AllocationError('COHORT_TOO_SMALL', 'cohort is below the privacy threshold', 409)
      }
      targetRef = cohort.cohortId
    }
    const forbidden = scan({ rationale: input.rationale ?? null })
    if (forbidden.length) {
      throw new AllocationError('PRIVATE_FIELD_PROHIBITED', 'intent contains prohibited personal data: ' + forbidden.join(', '))
    }
    const idempotencyKey = required(input.idempotencyKey, 'idempotencyKey', 200)
    const command = {
      sponsorCode: code,
      programId: input.programId,
      targetType: input.targetType,
      targetRef,
      amountMinor,
      currency: organization.currency,
      rationale: input.rationale ?? null,
      correlationId: required(input.correlationId, 'correlationId', 200),
    }
    const requestHash = hash(command)
    const scopedIdempotencyKey = code + ':' + idempotencyKey
    const existing = this.idempotency.get(scopedIdempotencyKey)
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new AllocationError('IDEMPOTENCY_CONFLICT', 'idempotency key reused with different request', 409)
      }
      return { ...existing.response, idempotentReplay: true }
    }
    const intentable = this.getOverviewInternal(code).intentableAllocationMinor
    if (amountMinor > intentable) {
      throw new AllocationError('INSUFFICIENT_ALLOCATION', 'insufficient uncommitted FEP allocation projection', 409)
    }
    const intent = {
      allocationIntentId: uid('intent'),
      ...command,
      status: 'SUBMITTED_FOR_FEP_REVIEW',
      idempotencyKey,
      requestHash,
      createdAt: this.now().toISOString(),
    }
    this.intents.set(intent.allocationIntentId, intent)
    this.idempotency.set(scopedIdempotencyKey, { requestHash, response: intent })
    this.auditEvent({
      actor: input.actor,
      sponsorCode: code,
      action: 'CREATE_ALLOCATION_INTENT',
      resourceType: 'ALLOCATION_INTENT',
      resourceId: intent.allocationIntentId,
      details: { targetType: intent.targetType, targetRef: intent.targetRef, requestHash },
    })
    return { ...intent }
  }

  recordFepIntentDisposition(intentId, input, receipt) {
    const intent = this.intents.get(intentId)
    if (!intent) throw new AllocationError('INTENT_NOT_FOUND', 'intent not found', 404)
    const disposition = {
      outcome: input.outcome,
      reasonCode: input.reasonCode ?? null,
      policyVersion: required(input.policyVersion, 'policyVersion', 120),
      intentRequestHash: required(input.intentRequestHash, 'intentRequestHash', 64),
    }
    if (!['ACCEPTED', 'REJECTED', 'EXPIRED'].includes(disposition.outcome)) {
      throw new AllocationError('INVALID_DISPOSITION', 'intent outcome is not supported')
    }
    if (disposition.intentRequestHash !== intent.requestHash) {
      throw new AllocationError('INTENT_HASH_MISMATCH', 'FEP disposition is not bound to this intent', 409)
    }
    const consumed = this.consumeFepReceipt(receipt, {
      contractVersion: 'fep-allocation-intent-disposition-v1',
      resourceType: 'ALLOCATION_INTENT',
      resourceId: intentId,
      payload: disposition,
    })
    if (consumed.replay) return { ...intent, idempotentReplay: true }
    if (intent.status !== 'SUBMITTED_FOR_FEP_REVIEW') {
      throw new AllocationError('INTENT_FINAL', 'intent is not awaiting FEP review', 409)
    }
    intent.status = disposition.outcome === 'ACCEPTED'
      ? 'ACCEPTED_BY_FEP_AWAITING_PROJECTION'
      : disposition.outcome === 'REJECTED'
        ? 'REJECTED_BY_FEP'
        : 'EXPIRED_BY_FEP'
    intent.reasonCode = disposition.reasonCode
    intent.fepPolicyVersion = disposition.policyVersion
    intent.fepDispositionReceiptId = receipt.receiptId
    intent.fepDispositionAt = receipt.issuedAt
    this.commitFepReceipt(receipt)
    return { ...intent }
  }

  listIntents({ actor, sponsorCode }) {
    const code = required(sponsorCode, 'sponsorCode', 80).toUpperCase()
    this.authorize(actor, code, 'VIEW')
    this.auditEvent({ actor, sponsorCode: code, action: 'VIEW_ALLOCATION_INTENTS', resourceType: 'ALLOCATION_INTENT_LIST' })
    return [...this.intents.values()]
      .filter((intent) => intent.sponsorCode === code)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((intent) => ({ ...intent }))
  }

  recordImpactProjection(sponsorCode, input, receipt) {
    const code = required(sponsorCode, 'sponsorCode', 80).toUpperCase()
    const program = this.programs.get(input.programId)
    if (!program || program.sponsorCode !== code) {
      throw new AllocationError('PROGRAM_ACCESS_DENIED', 'program not visible', 403)
    }
    const projection = {
      programId: input.programId,
      projectionVersion: input.projectionVersion,
      cohortCount: nonNegativeMinor(input.cohortCount, 'cohortCount'),
      metrics: input.metrics ?? {},
      asOf: timestamp(input.asOf, 'asOf'),
    }
    const forbidden = scan(projection.metrics)
    if (forbidden.length) {
      throw new AllocationError('PRIVATE_FIELD_PROHIBITED', 'impact projection contains prohibited data: ' + forbidden.join(', '))
    }
    const consumed = this.consumeFepReceipt(receipt, {
      contractVersion: 'fep-aggregate-impact-v1',
      resourceType: 'PROGRAM_IMPACT',
      resourceId: input.programId,
      payload: projection,
    })
    if (consumed.replay) return this.impact.get(input.programId)
    const result = projection.cohortCount < this.minimumCohortSize
      ? {
          programId: input.programId,
          projectionVersion: projection.projectionVersion,
          suppressed: true,
          minimumCohortSize: this.minimumCohortSize,
          reason: 'COHORT_TOO_SMALL',
          asOf: projection.asOf,
        }
      : {
          ...projection,
          suppressed: false,
        }
    this.impact.set(input.programId, result)
    this.commitFepReceipt(receipt)
    return { ...result }
  }

  getImpact({ actor, sponsorCode, programId }) {
    const code = required(sponsorCode, 'sponsorCode', 80).toUpperCase()
    this.authorize(actor, code, 'VIEW')
    const program = this.programs.get(programId)
    if (!program || program.sponsorCode !== code) {
      throw new AllocationError('PROGRAM_ACCESS_DENIED', 'program not visible', 403)
    }
    this.auditEvent({ actor, sponsorCode: code, action: 'VIEW_IMPACT', resourceType: 'PROGRAM_IMPACT', resourceId: programId })
    return this.impact.get(programId) ?? {
      programId,
      suppressed: true,
      reason: 'NO_FEP_IMPACT_PROJECTION',
      minimumCohortSize: this.minimumCohortSize,
    }
  }

  listAudit({ actor, sponsorCode, limit = 100 }) {
    const code = required(sponsorCode, 'sponsorCode', 80).toUpperCase()
    this.authorize(actor, code, 'VIEW_AUDIT')
    const boundedLimit = Math.max(1, Math.min(Number(limit) || 100, 500))
    this.auditEvent({ actor, sponsorCode: code, action: 'VIEW_AUDIT', resourceType: 'AUDIT_EVENT_LIST' })
    return this.audit.filter((event) => event.sponsorCode === code).slice(-boundedLimit).reverse()
  }
}

export {
  ALLOWED_DIMENSIONS,
  PROHIBITED_KEYS,
  ROLE_PERMISSIONS,
  scan as scanSponsorPayload,
}
