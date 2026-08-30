import { hash } from './canonical.js'
import { AllocationService, createFixtureFepReceipt } from './allocationService.js'

const fixtureVerifier = (receipt) =>
  receipt.signature === 'DEMO_VERIFIED_BY_INJECTED_FIXTURE_VERIFIER'

function receipt(resourceType, resourceId, contractVersion, payload, outcome = 'PUBLISHED') {
  return createFixtureFepReceipt({
    contractVersion,
    resourceType,
    resourceId,
    payload,
    outcome,
  })
}

export function createDemoAllocationService() {
  const service = new AllocationService({ verifyFepReceipt: fixtureVerifier })
  service.createOrganization({ code: 'LUZIONE', name: 'Luzione', currency: 'USD' })
  service.addMembership({ sponsorCode: 'LUZIONE', subjectId: 'demo-luzione-planner', role: 'ADMIN' })
  service.addMembership({ sponsorCode: 'LUZIONE', subjectId: 'demo-luzione-viewer', role: 'VIEWER' })
  const actor = service.actor('LUZIONE', 'demo-luzione-planner')

  const balanceProjection = {
    projectionVersion: 1,
    settledAllocationMinor: 2500000,
    committedAllocationMinor: 0,
    currency: 'USD',
    acceptedIntentIds: [],
    asOf: '2026-08-30T00:00:00.000Z',
  }
  service.recordFepAllocationProjection(
    'LUZIONE',
    balanceProjection,
    receipt('SPONSOR_ALLOCATION', 'LUZIONE', 'fep-allocation-balance-v1', balanceProjection),
  )

  const program = service.createProgram({
    actor,
    sponsorCode: 'LUZIONE',
    name: 'Work Enablement',
    allowedCategories: ['WORK_ENABLEMENT'],
    allowedRegions: ['US-CA-SAN-MATEO'],
    currency: 'USD',
  })
  service.submitProgram(actor, program.programId)
  const programDisposition = {
    outcome: 'ACCEPTED',
    policyVersion: 'fep-policy-demo-v1',
    reasonCode: null,
  }
  service.recordFepProgramDisposition(
    program.programId,
    programDisposition,
    receipt('PROGRAM', program.programId, 'fep-program-disposition-v1', programDisposition, 'ACCEPTED'),
  )

  const cohortInput = {
    cohortId: 'cohort_work_enablement_demo_v1',
    programId: program.programId,
    version: 1,
    name: 'Verified workers with near-term equipment needs',
    dimensions: ['WORK_STATUS_CONTEXT', 'ECONOMIC_HARDSHIP_BAND'],
    criteria: {
      WORK_STATUS_CONTEXT: 'JOB_AT_RISK',
      ECONOMIC_HARDSHIP_BAND: 'LOW_INCOME',
    },
    eligibleCount: 42,
  }
  const cohortProjection = {
    cohortId: cohortInput.cohortId,
    programId: cohortInput.programId,
    version: cohortInput.version,
    name: cohortInput.name,
    dimensions: [...cohortInput.dimensions],
    criteria: cohortInput.criteria,
    eligibleCount: cohortInput.eligibleCount,
    status: 'APPROVED',
    contentHash: hash(cohortInput),
  }
  service.publishReviewedCohort(
    cohortInput,
    receipt('COHORT', cohortInput.cohortId, 'fep-reviewed-cohort-v1', cohortProjection),
  )

  const cardInput = {
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
    consentVerified: true,
    reviewPolicyVersion: 'public-card-v1',
  }
  const cardProjection = {
    ...cardInput,
    approvedCohortTags: [...cardInput.approvedCohortTags],
    status: 'PUBLISHED',
  }
  service.publishPublicCardProjection(
    cardInput,
    receipt('PUBLIC_CASE_CARD', cardInput.publicCode, 'fep-public-case-card-v1', cardProjection),
  )

  const impactProjection = {
    programId: program.programId,
    projectionVersion: 1,
    cohortCount: 42,
    metrics: {
      acceptedAllocationMinor: 380000,
      fulfilledCaseCount: 23,
      verifiedOutcomeCount: 18,
    },
    asOf: '2026-08-30T00:00:00.000Z',
  }
  service.recordImpactProjection(
    'LUZIONE',
    impactProjection,
    receipt('PROGRAM_IMPACT', program.programId, 'fep-aggregate-impact-v1', impactProjection),
  )

  return { service, actor, programId: program.programId, cohortId: cohortInput.cohortId }
}

