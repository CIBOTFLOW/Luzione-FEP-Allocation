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
    publicCode: 'LZN-WORK-001',
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

  const availableCardInput = {
    publicCode: 'LZN-WORK-002',
    category: 'WORK_ENABLEMENT',
    headline: 'Transit access for a verified first month of work',
    generalizedRegion: 'US-CA-SAN-MATEO',
    approvedCohortTags: [
      'WORK_STATUS_CONTEXT:JOB_AT_RISK',
      'ECONOMIC_HARDSHIP_BAND:LOW_INCOME',
    ],
    requestedAmountMinor: 8400,
    currency: 'USD',
    summary: 'A verified worker needs a bounded transit pass to reach scheduled shifts during the first month.',
    consentVerified: true,
    reviewPolicyVersion: 'public-card-v1',
  }
  service.publishPublicCardProjection(
    availableCardInput,
    receipt(
      'PUBLIC_CASE_CARD',
      availableCardInput.publicCode,
      'fep-public-case-card-v1',
      { ...availableCardInput, approvedCohortTags: [...availableCardInput.approvedCohortTags], status: 'PUBLISHED' },
    ),
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

  const brand = service.registerBrandVersion({
    actor,
    sponsorCode: 'LUZIONE',
    displayName: 'Luzione',
    tagline: 'Design that helps complete useful outcomes.',
    logoAsset: {
      assetId: 'asset_luzione_wordmark_demo',
      fileName: 'luzione-wordmark.png',
      mimeType: 'image/png',
      byteSize: 24800,
      sha256: '7'.repeat(64),
      altText: 'Luzione wordmark',
    },
  })
  const brandReview = {
    outcome: 'APPROVED',
    reasonCode: null,
    reviewPolicyVersion: 'fep-brand-safety-demo-v1',
    brandContentHash: brand.contentHash,
  }
  service.recordBrandReview(
    brand.brandVersionId,
    brandReview,
    receipt('SPONSOR_BRAND_VERSION', brand.brandVersionId, 'fep-sponsor-brand-review-v1', brandReview, 'APPROVED'),
  )

  const campaign = service.createCampaign({
    actor,
    sponsorCode: 'LUZIONE',
    brandVersionId: brand.brandVersionId,
    fundingRail: 'SPONSORED_DIRECT_GIFT',
    name: 'The First 25 Useful Outcomes',
    publicSummary: 'A tightly capped pilot that funds one verified, practical outcome at a time.',
    budgetMinor: 250000,
    perOutcomeCapMinor: 25000,
    currency: 'USD',
    allowedCategories: ['WORK_ENABLEMENT'],
    allowedRegions: ['US-CA-SAN-MATEO'],
    startsAt: '2026-09-01T00:00:00.000Z',
    endsAt: '2026-12-31T23:59:59.000Z',
    attributionMode: 'SPONSOR_NAME_AND_TAGLINE',
    acknowledgements: {
      nonCharitableAcknowledged: true,
      noRecipientContact: true,
      noPublicityCondition: true,
      noCashOutOrExchange: true,
    },
  })
  service.submitCampaign(actor, campaign.campaignId)
  const campaignDisposition = {
    outcome: 'ACCEPTED',
    reasonCode: null,
    policyVersion: 'fep-sponsor-campaign-demo-v1',
    campaignHash: campaign.campaignHash,
  }
  service.recordCampaignDisposition(
    campaign.campaignId,
    campaignDisposition,
    receipt('SPONSOR_CAMPAIGN', campaign.campaignId, 'fep-sponsor-campaign-disposition-v1', campaignDisposition, 'ACCEPTED'),
  )

  const sponsoredOutcome = service.createSponsoredOutcomeRequest({
    actor,
    sponsorCode: 'LUZIONE',
    campaignId: campaign.campaignId,
    publicCaseCode: cardInput.publicCode,
    amountMinor: cardInput.requestedAmountMinor,
    rationale: 'Complete one verified work-enablement outcome.',
    correlationId: 'demo-first-25-outcome-1',
    idempotencyKey: 'demo-first-25-outcome-1',
    acknowledgements: {
      nonCharitableAcknowledged: true,
      noRecipientContact: true,
      noPublicityCondition: true,
      noCashOutOrExchange: true,
    },
  })
  const sponsoredOutcomeDisposition = {
    outcome: 'ACCEPTED',
    reasonCode: 'PUBLIC_CASE_AVAILABLE',
    policyVersion: 'fep-sponsored-outcome-demo-v1',
    requestHash: sponsoredOutcome.requestHash,
  }
  service.recordSponsoredOutcomeDisposition(
    sponsoredOutcome.sponsoredOutcomeRequestId,
    sponsoredOutcomeDisposition,
    receipt(
      'SPONSORED_OUTCOME_REQUEST',
      sponsoredOutcome.sponsoredOutcomeRequestId,
      'fep-sponsored-outcome-request-disposition-v1',
      sponsoredOutcomeDisposition,
      'ACCEPTED',
    ),
  )

  const mediaEventId = 'media_first_25_demo_1'
  const mediaStates = [
    ['FUNDED', 'PENDING'],
    ['RESERVED', 'PENDING'],
    ['SENT_OR_ORDERED', 'PENDING'],
    ['DELIVERED', 'RECONCILED'],
    ['OUTCOME_CONFIRMED', 'RECONCILED'],
  ]
  mediaStates.forEach(([lifecycleState, reconciliationState], index) => {
    const mediaPayload = {
      mediaEventId,
      version: index + 1,
      campaignId: campaign.campaignId,
      brandVersionId: brand.brandVersionId,
      publicCaseCode: cardInput.publicCode,
      lifecycleState,
      headline: lifecycleState === 'OUTCOME_CONFIRMED' ? 'Required safety equipment received' : cardInput.headline,
      summary: lifecycleState === 'OUTCOME_CONFIRMED'
        ? 'The recipient privately confirmed that the required equipment was received.'
        : cardInput.summary,
      category: cardInput.category,
      generalizedRegion: cardInput.generalizedRegion,
      amountMinor: cardInput.requestedAmountMinor,
      currency: cardInput.currency,
      occurredAt: `2026-09-03T0${index + 1}:00:00.000Z`,
      attributionMode: campaign.attributionMode,
      publicationConsentVersion: 'recipient-publication-consent-demo-v1',
      sponsorConsentVersion: 'sponsor-publication-consent-demo-v1',
      reconciliationState,
      status: 'PUBLISHED',
    }
    service.publishMediaEventProjection(
      { ...mediaPayload, publicationConsentVerified: true },
      receipt('MEDIA_EVENT', mediaEventId, 'fep-media-event-v1', mediaPayload),
    )
  })

  return {
    service,
    actor,
    programId: program.programId,
    cohortId: cohortInput.cohortId,
    campaignId: campaign.campaignId,
    brandVersionId: brand.brandVersionId,
  }
}
