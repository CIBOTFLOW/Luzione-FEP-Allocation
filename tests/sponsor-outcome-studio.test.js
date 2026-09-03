import assert from 'node:assert/strict'
import test from 'node:test'

import { AllocationService, createFixtureFepReceipt } from '../src/allocationService.js'
import { LUZIONE_VALUE_BOUNDARY } from '../src/luzioneValueBoundary.js'

const verifyFixture = (receipt) => receipt.signature === 'DEMO_VERIFIED_BY_INJECTED_FIXTURE_VERIFIER'

function receipt(contractVersion, resourceType, resourceId, payload) {
  return createFixtureFepReceipt({ contractVersion, resourceType, resourceId, payload })
}

function acknowledgements() {
  return {
    nonCharitableAcknowledged: true,
    noRecipientContact: true,
    noPublicityCondition: true,
    noCashOutOrExchange: true,
  }
}

function publishCard(service, publicCode = 'LZN-OUTCOME-1', requestedAmountMinor = 7500) {
  const input = {
    publicCode,
    category: 'WORK_ENABLEMENT',
    headline: 'Required work equipment',
    generalizedRegion: 'US-CA-SAN-MATEO',
    approvedCohortTags: ['WORK_STATUS_CONTEXT:JOB_AT_RISK'],
    requestedAmountMinor,
    currency: 'USD',
    summary: 'A verified worker needs one required item before a scheduled shift.',
    consentVerified: true,
    reviewPolicyVersion: 'public-card-v1',
  }
  const projection = { ...input, approvedCohortTags: [...input.approvedCohortTags], status: 'PUBLISHED' }
  return service.publishPublicCardProjection(
    input,
    receipt('fep-public-case-card-v1', 'PUBLIC_CASE_CARD', publicCode, projection),
  )
}

function approveBrand(service, actor, sponsorCode = 'ACME', overrides = {}) {
  const brand = service.registerBrandVersion({
    actor,
    sponsorCode,
    displayName: 'Acme',
    tagline: 'Completing useful outcomes.',
    logoAsset: {
      assetId: 'asset-acme-logo-v1',
      fileName: 'acme.png',
      mimeType: 'image/png',
      byteSize: 4096,
      sha256: 'a'.repeat(64),
      altText: 'Acme logo',
    },
    ...overrides,
  })
  const review = {
    outcome: 'APPROVED',
    reasonCode: null,
    reviewPolicyVersion: 'brand-review-v1',
    brandContentHash: brand.contentHash,
  }
  service.recordBrandReview(
    brand.brandVersionId,
    review,
    receipt('fep-sponsor-brand-review-v1', 'SPONSOR_BRAND_VERSION', brand.brandVersionId, review),
  )
  return brand
}

function approveCampaign(service, actor, brand, overrides = {}) {
  const campaign = service.createCampaign({
    actor,
    sponsorCode: 'ACME',
    brandVersionId: brand.brandVersionId,
    fundingRail: 'SPONSORED_DIRECT_GIFT',
    name: 'First useful outcomes',
    publicSummary: 'A small pilot for verified work-enablement outcomes.',
    budgetMinor: 30000,
    perOutcomeCapMinor: 10000,
    currency: 'USD',
    allowedCategories: ['WORK_ENABLEMENT'],
    allowedRegions: ['US-CA-SAN-MATEO'],
    startsAt: '2026-09-01T00:00:00.000Z',
    endsAt: '2026-09-30T23:59:59.000Z',
    attributionMode: 'SPONSOR_NAME_AND_TAGLINE',
    acknowledgements: acknowledgements(),
    ...overrides,
  })
  service.submitCampaign(actor, campaign.campaignId)
  const disposition = {
    outcome: 'ACCEPTED',
    reasonCode: null,
    policyVersion: 'campaign-policy-v1',
    campaignHash: campaign.campaignHash,
  }
  service.recordCampaignDisposition(
    campaign.campaignId,
    disposition,
    receipt('fep-sponsor-campaign-disposition-v1', 'SPONSOR_CAMPAIGN', campaign.campaignId, disposition),
  )
  return campaign
}

function fixture() {
  const service = new AllocationService({
    verifyFepReceipt: verifyFixture,
    now: () => new Date('2026-09-03T12:00:00.000Z'),
  })
  service.createOrganization({ code: 'ACME', name: 'Acme', currency: 'USD' })
  service.createOrganization({ code: 'OTHER', name: 'Other', currency: 'USD' })
  service.addMembership({ sponsorCode: 'ACME', subjectId: 'admin-1', role: 'ADMIN' })
  service.addMembership({ sponsorCode: 'ACME', subjectId: 'viewer-1', role: 'VIEWER' })
  service.addMembership({ sponsorCode: 'OTHER', subjectId: 'other-admin', role: 'ADMIN' })
  const actor = service.actor('ACME', 'admin-1')
  const viewer = service.actor('ACME', 'viewer-1')
  const otherActor = service.actor('OTHER', 'other-admin')
  const card = publishCard(service)
  const brand = approveBrand(service, actor)
  const campaign = approveCampaign(service, actor, brand)
  return { service, actor, viewer, otherActor, card, brand, campaign }
}

function sponsoredOutcome(service, actor, campaign, card, overrides = {}) {
  return service.createSponsoredOutcomeRequest({
    actor,
    sponsorCode: 'ACME',
    campaignId: campaign.campaignId,
    publicCaseCode: card.publicCode,
    amountMinor: card.requestedAmountMinor,
    rationale: 'Complete this bounded verified outcome.',
    correlationId: 'corr-outcome-1',
    idempotencyKey: 'idem-outcome-1',
    acknowledgements: acknowledgements(),
    ...overrides,
  })
}

function mediaPayload({ campaign, brand, card, lifecycleState, version, reconciliationState = 'PENDING' }) {
  return {
    mediaEventId: 'media-outcome-1',
    version,
    campaignId: campaign.campaignId,
    brandVersionId: brand.brandVersionId,
    publicCaseCode: card.publicCode,
    lifecycleState,
    headline: lifecycleState === 'OUTCOME_CONFIRMED' ? 'Required equipment received' : card.headline,
    summary: lifecycleState === 'OUTCOME_CONFIRMED'
      ? 'The recipient privately confirmed receipt of the required equipment.'
      : card.summary,
    category: card.category,
    generalizedRegion: card.generalizedRegion,
    amountMinor: card.requestedAmountMinor,
    currency: card.currency,
    occurredAt: `2026-09-03T${String(version + 12).padStart(2, '0')}:00:00.000Z`,
    attributionMode: campaign.attributionMode,
    publicationConsentVersion: 'recipient-consent-v1',
    sponsorConsentVersion: 'sponsor-consent-v1',
    reconciliationState,
    status: 'PUBLISHED',
  }
}

function publishMedia(service, values) {
  const payload = mediaPayload(values)
  return service.publishMediaEventProjection(
    { ...payload, publicationConsentVerified: true },
    receipt('fep-media-event-v1', 'MEDIA_EVENT', payload.mediaEventId, payload),
  )
}

test('brand assets are versioned, reviewed, immutable snapshots with no browser upload secret', () => {
  const { service, actor, brand } = fixture()
  const listed = service.listBrandVersions({ actor, sponsorCode: 'ACME' })
  assert.equal(listed[0].status, 'APPROVED')
  assert.equal(listed[0].contentHash, brand.contentHash)
  assert.deepEqual(Object.keys(listed[0].logoAsset).sort(), ['altText', 'assetId', 'byteSize', 'fileName', 'mimeType', 'sha256'])

  const second = service.registerBrandVersion({
    actor,
    sponsorCode: 'ACME',
    displayName: 'Acme',
    tagline: 'A new reviewed tagline.',
    logoAsset: {
      assetId: 'asset-acme-logo-v2',
      fileName: 'acme-v2.webp',
      mimeType: 'image/webp',
      byteSize: 5000,
      sha256: 'b'.repeat(64),
      altText: 'Acme logo',
    },
  })
  assert.equal(second.version, 2)
  assert.equal(second.status, 'PENDING_REVIEW')
  assert.equal(service.listBrandVersions({ actor, sponsorCode: 'ACME' }).find((item) => item.version === 1).tagline, brand.tagline)
})

test('unsafe logo types and financial-value marketing fail closed', () => {
  const { service, actor, brand } = fixture()
  assert.throws(
    () => service.registerBrandVersion({
      actor,
      sponsorCode: 'ACME',
      displayName: 'Acme',
      tagline: 'A standard tagline.',
      logoAsset: {
        assetId: 'asset-svg', fileName: 'logo.svg', mimeType: 'image/svg+xml', byteSize: 100,
        sha256: 'c'.repeat(64), altText: 'Acme logo',
      },
    }),
    (error) => error.code === 'LOGO_MIME_TYPE_INVALID',
  )
  assert.throws(
    () => service.createCampaign({
      actor,
      sponsorCode: 'ACME',
      brandVersionId: brand.brandVersionId,
      fundingRail: 'SPONSORED_DIRECT_GIFT',
      name: 'Speculation campaign',
      publicSummary: 'Participate now for a future coin that may appreciate.',
      budgetMinor: 10000,
      perOutcomeCapMinor: 10000,
      currency: 'USD',
      allowedCategories: ['WORK_ENABLEMENT'],
      allowedRegions: [],
      startsAt: '2026-09-01T00:00:00.000Z',
      endsAt: '2026-09-30T00:00:00.000Z',
      attributionMode: 'SPONSOR_NAME_ONLY',
      acknowledgements: acknowledgements(),
    }),
    (error) => error.code === 'FINANCIAL_PROMISE_PROHIBITED',
  )
  assert.throws(
    () => service.createCampaign({
      actor,
      sponsorCode: 'ACME',
      brandVersionId: brand.brandVersionId,
      fundingRail: 'SPONSORED_DIRECT_GIFT',
      name: 'Charitable campaign',
      publicSummary: 'Every direct gift is tax-deductible.',
      budgetMinor: 10000,
      perOutcomeCapMinor: 10000,
      currency: 'USD',
      allowedCategories: ['WORK_ENABLEMENT'],
      allowedRegions: [],
      startsAt: '2026-09-01T00:00:00.000Z',
      endsAt: '2026-09-30T00:00:00.000Z',
      attributionMode: 'SPONSOR_NAME_ONLY',
      acknowledgements: acknowledgements(),
    }),
    (error) => error.code === 'CHARITABLE_CLAIM_PROHIBITED',
  )
})

test('specific-outcome sponsorship is a separate public-code rail and never weakens program allocation rules', () => {
  const { service, actor, campaign, card } = fixture()
  const request = sponsoredOutcome(service, actor, campaign, card)
  assert.deepEqual(request, {
    sponsoredOutcomeRequestId: request.sponsoredOutcomeRequestId,
    sponsorCode: 'ACME',
    campaignId: campaign.campaignId,
    publicCaseCode: card.publicCode,
    amountMinor: 7500,
    currency: 'USD',
    status: 'SUBMITTED_FOR_FEP_REVIEW',
    requestHash: request.requestHash,
    createdAt: '2026-09-03T12:00:00.000Z',
    charitableDeductionClaimed: false,
    recipientIdentityDisclosed: false,
    publicityRequired: false,
    effectMode: 'DISABLED',
  })
  assert.equal('recipientId' in request, false)
  assert.equal('caseId' in request, false)
  assert.throws(
    () => service.createAllocationIntent({
      actor,
      sponsorCode: 'ACME',
      programId: 'anything',
      targetType: 'PUBLIC_CASE_CARD',
      publicCode: card.publicCode,
      amountMinor: 7500,
      idempotencyKey: 'wrong-rail',
      correlationId: 'wrong-rail',
    }),
    (error) => error.code === 'NAMED_RECIPIENT_TARGET_PROHIBITED',
  )
})

test('direct sponsorship requires every acknowledgement, exact funded amount, and public-safe copy', () => {
  const { service, actor, campaign, card } = fixture()
  assert.throws(
    () => sponsoredOutcome(service, actor, campaign, card, {
      acknowledgements: { ...acknowledgements(), noPublicityCondition: false },
    }),
    (error) => error.code === 'DIRECT_GIFT_ACKNOWLEDGEMENTS_REQUIRED',
  )
  assert.throws(
    () => sponsoredOutcome(service, actor, campaign, card, { amountMinor: 7000 }),
    (error) => error.code === 'OUTCOME_AMOUNT_INVALID',
  )
  assert.throws(
    () => sponsoredOutcome(service, actor, campaign, card, { rationale: 'Contact person@example.com.' }),
    (error) => error.code === 'PRIVATE_FIELD_PROHIBITED',
  )
  assert.throws(
    () => sponsoredOutcome(service, actor, campaign, card, { recipient_name: 'A hidden identity' }),
    (error) => error.code === 'INPUT_SHAPE_INVALID',
  )
})

test('sponsored outcome idempotency, case holds, tenant isolation, and FEP hash binding fail closed', () => {
  const { service, actor, otherActor, campaign, card } = fixture()
  const first = sponsoredOutcome(service, actor, campaign, card)
  const replay = sponsoredOutcome(service, actor, campaign, card)
  assert.equal(replay.idempotentReplay, true)
  assert.equal(replay.sponsoredOutcomeRequestId, first.sponsoredOutcomeRequestId)
  assert.throws(
    () => sponsoredOutcome(service, actor, campaign, card, { idempotencyKey: 'another-request' }),
    (error) => error.code === 'CASE_NOT_AVAILABLE',
  )
  assert.throws(
    () => service.listSponsoredOutcomeRequests({ actor: otherActor, sponsorCode: 'ACME' }),
    (error) => error.code === 'TENANT_ACCESS_DENIED',
  )
  const disposition = {
    outcome: 'ACCEPTED',
    reasonCode: null,
    policyVersion: 'direct-gift-v1',
    requestHash: 'f'.repeat(64),
  }
  assert.throws(
    () => service.recordSponsoredOutcomeDisposition(
      first.sponsoredOutcomeRequestId,
      disposition,
      receipt('fep-sponsored-outcome-request-disposition-v1', 'SPONSORED_OUTCOME_REQUEST', first.sponsoredOutcomeRequestId, disposition),
    ),
    (error) => error.code === 'SPONSORED_OUTCOME_HASH_MISMATCH',
  )
})

test('FEP acceptance remains explicitly no-effect and keeps the campaign amount committed', () => {
  const { service, actor, campaign, card } = fixture()
  const request = sponsoredOutcome(service, actor, campaign, card)
  const disposition = {
    outcome: 'ACCEPTED',
    reasonCode: 'PUBLIC_CASE_AVAILABLE',
    policyVersion: 'direct-gift-v1',
    requestHash: request.requestHash,
  }
  const accepted = service.recordSponsoredOutcomeDisposition(
    request.sponsoredOutcomeRequestId,
    disposition,
    receipt('fep-sponsored-outcome-request-disposition-v1', 'SPONSORED_OUTCOME_REQUEST', request.sponsoredOutcomeRequestId, disposition),
  )
  assert.equal(accepted.status, 'ACCEPTED_BY_FEP_NO_EFFECT')
  assert.equal(accepted.effectMode, 'DISABLED')
  assert.equal(service.listCampaigns({ actor, sponsorCode: 'ACME' })[0].committedMinor, 7500)
  const replay = sponsoredOutcome(service, actor, campaign, card)
  assert.equal(replay.idempotentReplay, true)
  assert.equal(replay.status, 'ACCEPTED_BY_FEP_NO_EFFECT')
})

test('proof media advances exact states, requires consent and reconciliation, and pins sponsor branding', () => {
  const { service, actor, campaign, brand, card } = fixture()
  const noConsent = mediaPayload({ campaign, brand, card, lifecycleState: 'FUNDED', version: 1 })
  assert.throws(
    () => service.publishMediaEventProjection(
      { ...noConsent, publicationConsentVerified: false },
      receipt('fep-media-event-v1', 'MEDIA_EVENT', noConsent.mediaEventId, noConsent),
    ),
    (error) => error.code === 'PUBLICATION_CONSENT_REQUIRED',
  )

  const fundedPayload = mediaPayload({ campaign, brand, card, lifecycleState: 'FUNDED', version: 1 })
  const fundedReceipt = receipt('fep-media-event-v1', 'MEDIA_EVENT', fundedPayload.mediaEventId, fundedPayload)
  service.publishMediaEventProjection({ ...fundedPayload, publicationConsentVerified: true }, fundedReceipt)
  assert.throws(
    () => publishMedia(service, { campaign, brand, card, lifecycleState: 'DELIVERED', version: 2, reconciliationState: 'RECONCILED' }),
    (error) => error.code === 'MEDIA_LIFECYCLE_JUMP',
  )
  publishMedia(service, { campaign, brand, card, lifecycleState: 'RESERVED', version: 2 })
  publishMedia(service, { campaign, brand, card, lifecycleState: 'SENT_OR_ORDERED', version: 3 })
  assert.throws(
    () => publishMedia(service, { campaign, brand, card, lifecycleState: 'DELIVERED', version: 4 }),
    (error) => error.code === 'MEDIA_RECONCILIATION_REQUIRED',
  )
  publishMedia(service, { campaign, brand, card, lifecycleState: 'DELIVERED', version: 4, reconciliationState: 'RECONCILED' })
  const confirmed = publishMedia(service, {
    campaign, brand, card, lifecycleState: 'OUTCOME_CONFIRMED', version: 5, reconciliationState: 'RECONCILED',
  })
  assert.equal(confirmed.verifiedOutcome, true)
  assert.equal(confirmed.sponsor.displayName, 'Acme')
  assert.equal(confirmed.sponsor.brandVersionId, brand.brandVersionId)
  assert.equal('publicationConsentVersion' in confirmed, false)
  assert.equal(service.listProofFeed({ actor, sponsorCode: 'ACME' })[0].lifecycleLabel, 'Outcome confirmed')
  const lateFundedReplay = service.publishMediaEventProjection(
    { ...fundedPayload, publicationConsentVerified: true },
    fundedReceipt,
  )
  assert.equal(lateFundedReplay.version, 5)
  assert.equal(lateFundedReplay.lifecycleState, 'OUTCOME_CONFIRMED')
})

test('FEP can withdraw public media without deleting the historical projection', () => {
  const { service, actor, campaign, brand, card } = fixture()
  publishMedia(service, { campaign, brand, card, lifecycleState: 'FUNDED', version: 1 })
  const withdrawal = {
    version: 2,
    reasonCode: 'CONSENT_REVOKED',
    withdrawnAt: '2026-09-03T14:30:00.000Z',
  }
  const withdrawalReceipt = receipt('fep-media-event-withdrawal-v1', 'MEDIA_EVENT', 'media-outcome-1', withdrawal)
  assert.deepEqual(
    service.withdrawMediaEventProjection('media-outcome-1', withdrawal, withdrawalReceipt),
    { mediaEventId: 'media-outcome-1', status: 'WITHDRAWN', version: 2 },
  )
  assert.deepEqual(
    service.withdrawMediaEventProjection('media-outcome-1', withdrawal, withdrawalReceipt),
    { mediaEventId: 'media-outcome-1', status: 'WITHDRAWN', version: 2 },
  )
  assert.deepEqual(service.listProofFeed({ actor, sponsorCode: 'ACME' }), [])
  assert.equal(service.mediaEvents.get('media-outcome-1').withdrawalReasonCode, 'CONSENT_REVOKED')
})

test('Luzione value boundary keeps recognition nonmonetary and essentials credits closed-loop', () => {
  assert.equal(LUZIONE_VALUE_BOUNDARY.recognition.monetaryValue, false)
  assert.equal(LUZIONE_VALUE_BOUNDARY.recognition.futureConversionEntitlement, false)
  assert.equal(LUZIONE_VALUE_BOUNDARY.essentialsCredits.cashOut, false)
  assert.equal(LUZIONE_VALUE_BOUNDARY.essentialsCredits.peerToPeerTransfer, false)
  assert.equal(LUZIONE_VALUE_BOUNDARY.essentialsCredits.exchangeListing, false)
  assert.equal(LUZIONE_VALUE_BOUNDARY.settlement.reserveMayFundOperations, false)
  assert.ok(Object.isFrozen(LUZIONE_VALUE_BOUNDARY.essentialsCredits))
})
