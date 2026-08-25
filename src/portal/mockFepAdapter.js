import { AllocationError } from '../canonical.js'
import { AllocationService } from '../allocationService.js'
import {
  MINIMUM_COHORT_SIZE,
  allocationPosture,
  assertPublicSafePayload,
} from './contracts.js'

const service = new AllocationService({ minimumCohortSize: MINIMUM_COHORT_SIZE })

const sponsors = [
  service.createOrganization({
    code: 'LUZIONE',
    name: 'Luzione',
    availableAllocationMinor: 2500000,
    currency: 'USD',
  }),
  service.createOrganization({
    code: 'NORTHSTAR',
    name: 'Northstar Pilot',
    availableAllocationMinor: 900000,
    currency: 'USD',
  }),
]

const workProgram = service.createProgram({
  sponsorCode: 'LUZIONE',
  name: 'Work Enablement',
  allowedCategories: ['WORK_ENABLEMENT'],
  allowedRegions: ['US-CA-SAN-MATEO', 'US-CA-ALAMEDA'],
})
workProgram.status = 'ACTIVE'
workProgram.description = 'Public-safe support for job readiness, transit, and required equipment.'

const foodProgram = service.createProgram({
  sponsorCode: 'LUZIONE',
  name: 'Household Stability',
  allowedCategories: ['FOOD', 'BASIC_NEEDS'],
  allowedRegions: ['US-CA-SAN-MATEO'],
})
foodProgram.status = 'ACTIVE'
foodProgram.description = 'Aggregate support for reviewed household stability cohorts.'

const northstarProgram = service.createProgram({
  sponsorCode: 'NORTHSTAR',
  name: 'Training Continuity',
  allowedCategories: ['EDUCATION'],
  allowedRegions: ['US-WA-KING'],
})
northstarProgram.status = 'ACTIVE'

const cohortA = service.approveCohort({
  programId: workProgram.programId,
  name: 'Job-at-risk workers with low income',
  dimensions: ['WORK_STATUS_CONTEXT', 'ECONOMIC_HARDSHIP_BAND'],
  criteria: {
    WORK_STATUS_CONTEXT: 'JOB_AT_RISK',
    ECONOMIC_HARDSHIP_BAND: 'LOW_INCOME',
  },
})

const cohortB = service.approveCohort({
  programId: foodProgram.programId,
  name: 'Households with dietary restrictions',
  dimensions: ['HOUSEHOLD_TYPE', 'DIETARY_RESTRICTION'],
  criteria: {
    HOUSEHOLD_TYPE: 'DEPENDENTS_AT_HOME',
    DIETARY_RESTRICTION: 'MEDICALLY_REVIEWED',
  },
})

service.publishCard({
  publicCode: 'BRV-WORK-001',
  category: 'WORK_ENABLEMENT',
  headline: 'Safety equipment for a verified new job',
  generalizedRegion: 'US-CA-SAN-MATEO',
  approvedCohortTags: [
    'WORK_STATUS_CONTEXT:JOB_AT_RISK',
    'ECONOMIC_HARDSHIP_BAND:LOW_INCOME',
  ],
  requestedAmountMinor: 16500,
  currency: 'USD',
  summary: 'A verified worker needs required safety equipment before a scheduled shift.',
  consentRef: 'consent-public-1',
  reviewPolicyVersion: 'public-card-v1',
})

service.publishCard({
  publicCode: 'BRV-WORK-002',
  category: 'WORK_ENABLEMENT',
  headline: 'Transit support to keep a confirmed shift',
  generalizedRegion: 'US-CA-ALAMEDA',
  approvedCohortTags: [
    'WORK_STATUS_CONTEXT:JOB_AT_RISK',
    'ECONOMIC_HARDSHIP_BAND:LOW_INCOME',
  ],
  requestedAmountMinor: 8600,
  currency: 'USD',
  summary: 'A reviewed case needs short-term transit support tied to a verified work schedule.',
  consentRef: 'consent-public-2',
  reviewPolicyVersion: 'public-card-v1',
})

service.publishCard({
  publicCode: 'BRV-HOME-001',
  category: 'FOOD',
  headline: 'Restricted-diet groceries for a reviewed household',
  generalizedRegion: 'US-CA-SAN-MATEO',
  approvedCohortTags: [
    'HOUSEHOLD_TYPE:DEPENDENTS_AT_HOME',
    'DIETARY_RESTRICTION:MEDICALLY_REVIEWED',
  ],
  requestedAmountMinor: 12400,
  currency: 'USD',
  summary: 'A household has a reviewed need for restricted-diet groceries this week.',
  consentRef: 'consent-public-3',
  reviewPolicyVersion: 'public-card-v1',
})

function currentSponsor(code) {
  const sponsor = sponsors.find((item) => item.code === code)
  if (!sponsor) throw new AllocationError('SPONSOR_NOT_FOUND', 'sponsor not found', 404)
  return sponsor
}

function sponsorPrograms(sponsorCode) {
  currentSponsor(sponsorCode)
  return [...service.programs.values()].filter((program) => program.sponsorCode === sponsorCode)
}

function requireProgram(sponsorCode, programId) {
  const program = service.programs.get(programId)
  if (!program || program.sponsorCode !== sponsorCode) {
    throw new AllocationError('PROGRAM_ACCESS_DENIED', 'program not visible', 403)
  }
  return program
}

function visibleAudit(sponsorCode) {
  return service.audit.filter((event) => event.sponsorCode === sponsorCode)
}

export function getPortalSnapshot(sponsorCode = 'LUZIONE') {
  const sponsor = currentSponsor(sponsorCode)
  const programs = sponsorPrograms(sponsorCode)
  const primaryProgram = programs[0]
  const opportunities = primaryProgram
    ? service.listCards({ sponsorCode, programId: primaryProgram.programId })
    : []
  const intents = [...service.intents.values()].filter((intent) => intent.sponsorCode === sponsorCode)
  const reports = programs.map((program) => getReport({ sponsorCode, programId: program.programId }))

  assertPublicSafePayload({ sponsor, programs, opportunities, intents, reports })
  return {
    sponsor,
    programs,
    primaryProgram,
    opportunities,
    cohorts: getCohorts({ sponsorCode }),
    intents,
    reports,
    audit: visibleAudit(sponsorCode),
    posture: allocationPosture(),
  }
}

export function getSponsorMe(sponsorCode = 'LUZIONE') {
  const sponsor = currentSponsor(sponsorCode)
  return {
    ...sponsor,
    scopes: [
      'sponsor:identity',
      'programs:read',
      'allocation:read',
      'cohorts:read',
      'opportunities:read',
      'intents:read',
      'reports:aggregate:read',
      'audit:read',
      'allocation_intents:create',
    ],
    posture: allocationPosture(),
  }
}

export function getPrograms({ sponsorCode }) {
  return sponsorPrograms(sponsorCode)
}

export function getAllocation({ sponsorCode, programId }) {
  requireProgram(sponsorCode, programId)
  const sponsor = currentSponsor(sponsorCode)
  return {
    sponsorCode,
    programId,
    availableAllocationMinor: sponsor.availableAllocationMinor,
    currency: sponsor.currency,
    effectPosture: allocationPosture().effectPosture,
  }
}

export function getCohorts({ sponsorCode, programId = null }) {
  const programs = sponsorPrograms(sponsorCode)
  const allowedProgramIds = new Set(programs.map((program) => program.programId))
  if (programId) requireProgram(sponsorCode, programId)
  return [...service.cohorts.values()].filter((cohort) =>
    allowedProgramIds.has(cohort.programId) && (!programId || cohort.programId === programId)
  )
}

export function getOpportunities({ sponsorCode, programId, cohortId = null }) {
  const program = programId ? requireProgram(sponsorCode, programId) : sponsorPrograms(sponsorCode)[0]
  const cards = service.listCards({ sponsorCode, programId: program.programId, cohortId })
  assertPublicSafePayload(cards)
  return cards
}

export function createIntent({ sponsorCode, payload }) {
  requireProgram(sponsorCode, payload.programId)
  assertPublicSafePayload(payload)
  return service.createAllocationIntent({
    sponsorCode,
    ...payload,
    idempotencyKey: payload.idempotencyKey ?? `intent-${payload.programId}-${payload.publicCode ?? payload.cohortId}-${payload.amountMinor}`,
    correlationId: payload.correlationId ?? `portal-${Date.now()}`,
  })
}

export function getIntents({ sponsorCode }) {
  currentSponsor(sponsorCode)
  return [...service.intents.values()].filter((intent) => intent.sponsorCode === sponsorCode)
}

export function getIntent({ sponsorCode, intentId }) {
  const intent = service.intents.get(intentId)
  if (!intent || intent.sponsorCode !== sponsorCode) {
    throw new AllocationError('INTENT_NOT_FOUND', 'intent not visible', 404)
  }
  return intent
}

export function getReport({ sponsorCode, programId, cohortCount = 12 }) {
  const program = requireProgram(sponsorCode, programId)
  return service.report({
    sponsorCode,
    programId: program.programId,
    cohortCount,
    metrics: {
      intentsSubmitted: getIntents({ sponsorCode }).filter((intent) => intent.programId === program.programId).length,
      publicCardsAvailable: service.listCards({ sponsorCode, programId: program.programId }).length,
      approvedCohorts: getCohorts({ sponsorCode, programId: program.programId }).length,
    },
  })
}

export function getReports({ sponsorCode }) {
  return sponsorPrograms(sponsorCode).map((program) => getReport({ sponsorCode, programId: program.programId }))
}

export function getAudit({ sponsorCode }) {
  currentSponsor(sponsorCode)
  return visibleAudit(sponsorCode)
}

export function exportAudit({ sponsorCode }) {
  const audit = getAudit({ sponsorCode })
  assertPublicSafePayload(audit)
  return {
    sponsorCode,
    exportedAt: new Date().toISOString(),
    records: audit,
  }
}

export { service, cohortA, cohortB, workProgram, foodProgram, northstarProgram }
