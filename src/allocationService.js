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
])

function scan(value, path = 'root') {
  if (Array.isArray(value)) return value.flatMap((item, index) => scan(item, `${path}[${index}]`))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => [
      ...(PROHIBITED_KEYS.has(key.toLowerCase()) ? [`${path}.${key}`] : []),
      ...scan(child, `${path}.${key}`),
    ])
  }
  return []
}

export class AllocationService {
  constructor({ minimumCohortSize = 10 } = {}) {
    this.minimumCohortSize = minimumCohortSize
    this.organizations = new Map()
    this.programs = new Map()
    this.cohorts = new Map()
    this.cards = new Map()
    this.intents = new Map()
    this.audit = []
    this.idempotency = new Map()
  }

  createOrganization({ code, name, availableAllocationMinor = 0, currency = 'USD' }) {
    const organization = {
      organizationId: uid('org'),
      code,
      name,
      availableAllocationMinor,
      currency,
      status: 'ACTIVE',
    }
    this.organizations.set(code, organization)
    return organization
  }

  createProgram(input) {
    if (!this.organizations.has(input.sponsorCode)) {
      throw new AllocationError('SPONSOR_NOT_FOUND', 'sponsor not found', 404)
    }
    const program = { programId: uid('program'), status: 'DRAFT', ...input }
    this.programs.set(program.programId, program)
    return program
  }

  approveCohort(input) {
    const invalid = (input.dimensions ?? []).filter((dimension) => !ALLOWED_DIMENSIONS.has(dimension))
    if (invalid.length) {
      throw new AllocationError('UNAPPROVED_DIMENSION', `unapproved cohort dimensions: ${invalid.join(', ')}`)
    }
    const forbidden = scan(input.criteria)
    if (forbidden.length) {
      throw new AllocationError('PROHIBITED_CRITERIA', `prohibited criteria: ${forbidden.join(', ')}`)
    }
    const cohort = {
      cohortId: uid('cohort'),
      programId: input.programId,
      version: input.version ?? 1,
      name: input.name,
      dimensions: input.dimensions,
      criteria: input.criteria,
      status: 'APPROVED',
      contentHash: hash(input),
    }
    this.cohorts.set(cohort.cohortId, cohort)
    return cohort
  }

  publishCard(input) {
    const forbidden = scan(input)
    if (forbidden.length) {
      throw new AllocationError('PRIVATE_FIELD_PROHIBITED', `public card contains prohibited fields: ${forbidden.join(', ')}`)
    }
    if (!input.consentRef) throw new AllocationError('CONSENT_REQUIRED', 'public card requires consent reference')
    if (!input.reviewPolicyVersion) throw new AllocationError('REVIEW_REQUIRED', 'public card requires review policy version')
    const card = {
      cardId: uid('card'),
      sponsorContactAllowed: false,
      status: 'PUBLISHED',
      fundedAmountMinor: 0,
      ...input,
    }
    this.cards.set(card.publicCode, card)
    return card
  }

  listCards({ sponsorCode, programId, cohortId = null }) {
    if (!this.organizations.has(sponsorCode)) {
      throw new AllocationError('SPONSOR_NOT_FOUND', 'sponsor not found', 404)
    }
    const program = this.programs.get(programId)
    if (!program || program.sponsorCode !== sponsorCode) {
      throw new AllocationError('PROGRAM_ACCESS_DENIED', 'program not visible', 403)
    }
    const cohort = cohortId ? this.cohorts.get(cohortId) : null
    this.audit.push({
      eventId: uid('audit'),
      sponsorCode,
      action: 'VIEW_OPPORTUNITIES',
      programId,
      cohortId,
      occurredAt: new Date().toISOString(),
    })
    return [...this.cards.values()].filter((card) =>
      card.status === 'PUBLISHED' &&
      program.allowedCategories.includes(card.category) &&
      (!program.allowedRegions?.length || program.allowedRegions.includes(card.generalizedRegion)) &&
      (!cohort || cohort.dimensions.every((dimension) => card.approvedCohortTags.includes(`${dimension}:${cohort.criteria[dimension]}`)))
    )
  }

  createAllocationIntent(input) {
    const requestHash = hash(input)
    const existing = this.idempotency.get(input.idempotencyKey)
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new AllocationError('IDEMPOTENCY_CONFLICT', 'idempotency key reused with different request', 409)
      }
      return existing.response
    }

    const organization = this.organizations.get(input.sponsorCode)
    if (!organization) throw new AllocationError('SPONSOR_NOT_FOUND', 'sponsor not found', 404)
    const program = this.programs.get(input.programId)
    if (!program || program.sponsorCode !== input.sponsorCode) {
      throw new AllocationError('PROGRAM_ACCESS_DENIED', 'program not visible', 403)
    }
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new AllocationError('INVALID_AMOUNT', 'amount must be positive minor units')
    }
    if (input.amountMinor > organization.availableAllocationMinor) {
      throw new AllocationError('INSUFFICIENT_ALLOCATION', 'insufficient sponsor allocation', 409)
    }

    if (input.targetType === 'PUBLIC_CASE_CARD') {
      const card = this.cards.get(input.publicCode)
      if (!card || card.status !== 'PUBLISHED') {
        throw new AllocationError('CARD_NOT_AVAILABLE', 'public card not available', 404)
      }
      if (!program.allowedCategories.includes(card.category)) {
        throw new AllocationError('CATEGORY_NOT_ALLOWED', 'card category not allowed')
      }
    } else if (input.targetType === 'COHORT') {
      const cohort = this.cohorts.get(input.cohortId)
      if (!cohort || cohort.programId !== input.programId || cohort.status !== 'APPROVED') {
        throw new AllocationError('COHORT_NOT_APPROVED', 'cohort not approved', 409)
      }
    } else {
      throw new AllocationError('INVALID_TARGET', 'target must be public card or cohort')
    }

    const intent = {
      allocationIntentId: uid('intent'),
      sponsorCode: input.sponsorCode,
      programId: input.programId,
      targetType: input.targetType,
      publicCode: input.publicCode ?? null,
      cohortId: input.cohortId ?? null,
      amountMinor: input.amountMinor,
      currency: organization.currency,
      status: 'SUBMITTED_FOR_FEP_REVIEW',
      rationale: input.rationale ?? null,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      createdAt: new Date().toISOString(),
    }
    this.intents.set(intent.allocationIntentId, intent)
    this.idempotency.set(input.idempotencyKey, { requestHash, response: intent })
    this.audit.push({
      eventId: uid('audit'),
      sponsorCode: input.sponsorCode,
      action: 'CREATE_ALLOCATION_INTENT',
      resourceId: intent.allocationIntentId,
      occurredAt: intent.createdAt,
    })
    return intent
  }

  recordFepDisposition(intentId, { accepted, reason, reviewedBy }) {
    const intent = this.intents.get(intentId)
    if (!intent) throw new AllocationError('INTENT_NOT_FOUND', 'intent not found', 404)
    if (intent.status !== 'SUBMITTED_FOR_FEP_REVIEW') {
      throw new AllocationError('INTENT_FINAL', 'intent already disposed', 409)
    }
    intent.status = accepted ? 'ACCEPTED_BY_FEP' : 'REJECTED_BY_FEP'
    intent.reason = reason
    intent.reviewedBy = reviewedBy
    intent.reviewedAt = new Date().toISOString()
    if (accepted) {
      const organization = this.organizations.get(intent.sponsorCode)
      organization.availableAllocationMinor -= intent.amountMinor
    }
    return intent
  }

  report({ sponsorCode, programId, cohortCount, metrics }) {
    if (cohortCount < this.minimumCohortSize) {
      return { suppressed: true, minimumCohortSize: this.minimumCohortSize, reason: 'COHORT_TOO_SMALL' }
    }
    return {
      suppressed: false,
      sponsorCode,
      programId,
      cohortCount,
      metrics,
      generatedAt: new Date().toISOString(),
    }
  }
}

export { ALLOWED_DIMENSIONS, PROHIBITED_KEYS }
