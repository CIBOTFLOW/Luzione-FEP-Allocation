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
  VIEWER: new Set(['VIEW', 'POST_MOVEMENT_UPDATE', 'ENGAGE_MOVEMENT']),
  PLANNER: new Set([
    'VIEW',
    'CREATE_INTENT',
    'CONFIGURE_PROGRAM',
    'CONFIGURE_BRAND',
    'CONFIGURE_CAMPAIGN',
    'SPONSOR_OUTCOME',
    'POST_MOVEMENT_UPDATE',
    'ENGAGE_MOVEMENT',
  ]),
  ADMIN: new Set([
    'VIEW',
    'CREATE_INTENT',
    'CONFIGURE_PROGRAM',
    'CONFIGURE_BRAND',
    'CONFIGURE_CAMPAIGN',
    'SPONSOR_OUTCOME',
    'POST_MOVEMENT_UPDATE',
    'ENGAGE_MOVEMENT',
    'VIEW_AUDIT',
  ]),
}

const HELD_INTENT_STATUSES = new Set([
  'SUBMITTED_FOR_FEP_REVIEW',
  'ACCEPTED_BY_FEP_AWAITING_PROJECTION',
])

const CAMPAIGN_RAILS = new Set([
  'MERCHANT_FUNDED_OUTCOME',
  'SPONSORED_DIRECT_GIFT',
  'GOVERNED_PROGRAM_SUPPORT',
])

const ATTRIBUTION_MODES = new Set([
  'SPONSOR_NAME_AND_TAGLINE',
  'SPONSOR_NAME_ONLY',
  'ANONYMOUS',
])

const BRAND_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

const MOVEMENT_MEDIA_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'video/mp4',
  'video/webm',
])

const MOVEMENT_INTERACTIONS = new Set(['LIKE', 'SAVE', 'SEND', 'FOLLOW'])

const HELD_SPONSORED_OUTCOME_STATUSES = new Set([
  'SUBMITTED_FOR_FEP_REVIEW',
  'ACCEPTED_BY_FEP_NO_EFFECT',
])

const MEDIA_LIFECYCLE = Object.freeze([
  'FUNDED',
  'RESERVED',
  'SENT_OR_ORDERED',
  'DELIVERED',
  'OUTCOME_CONFIRMED',
])

const FINANCIAL_PROMISE_KEYS = new Set([
  'token',
  'coin',
  'crypto',
  'cashout',
  'cash_out',
  'conversion_rate',
  'market_price',
  'staking',
  'yield',
  'investment_return',
])

const FINANCIAL_PROMISE_PATTERN = /\b(?:(?:digital\s+)?token|coin|crypto(?:currency)?|wallet|mint(?:ed|ing)?|presale|cash[- ]?out|convert(?:ible)?\s+to\s+(?:cash|crypto)|trade(?:d|able)|appreciat(?:e|ion)|profit|investment|staking|yield|airdrop)\b/i
const CHARITABLE_CLAIM_PATTERN = /\b(?:tax[- ]?deductible|charitable\s+(?:gift|donation|contribution)|tax\s+(?:deduction|receipt))\b/i

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i
const PHONE_PATTERN = /\b(?:\+?\d[\d(). -]{7,}\d)\b/
const STREET_PATTERN = /\b\d{1,6}\s+[A-Z0-9.'-]+(?:\s+[A-Z0-9.'-]+){0,4}\s+(?:STREET|ST|ROAD|RD|AVENUE|AVE|BOULEVARD|BLVD|LANE|LN|DRIVE|DR)\b/i
const MACHINE_DIGEST_PATH = /\.(?:sha256|contentHash|requestHash|campaignHash|acknowledgementHash|publicCardHash)$/

function scan(value, path = 'root') {
  if (Array.isArray(value)) return value.flatMap((item, index) => scan(item, path + '[' + index + ']'))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => [
      ...(PROHIBITED_KEYS.has(key.toLowerCase()) ? [path + '.' + key] : []),
      ...scan(child, path + '.' + key),
    ])
  }
  if (typeof value === 'string') {
    if (MACHINE_DIGEST_PATH.test(path) && /^[a-f0-9]{64}$/i.test(value)) return []
    const findings = []
    if (EMAIL_PATTERN.test(value)) findings.push(path + ':email')
    if (PHONE_PATTERN.test(value)) findings.push(path + ':phone')
    if (STREET_PATTERN.test(value)) findings.push(path + ':street-address')
    return findings
  }
  return []
}

function scanFinancialPromise(value, path = 'root') {
  if (Array.isArray(value)) return value.flatMap((item, index) => scanFinancialPromise(item, path + '[' + index + ']'))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => [
      ...(FINANCIAL_PROMISE_KEYS.has(key.toLowerCase()) ? [path + '.' + key] : []),
      ...scanFinancialPromise(child, path + '.' + key),
    ])
  }
  if (typeof value === 'string' && FINANCIAL_PROMISE_PATTERN.test(value)) return [path + ':financial-promise']
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

function assertAllowedKeys(value, allowedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AllocationError('INPUT_SHAPE_INVALID', label + ' must be an object')
  }
  const allowed = new Set(allowedKeys)
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key))
  if (unexpected.length) {
    throw new AllocationError('INPUT_SHAPE_INVALID', label + ' contains unsupported fields: ' + unexpected.sort().join(', '))
  }
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

function digest(value, field) {
  const normalized = required(value, field, 64).toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new AllocationError('INVALID_DIGEST', field + ' must be a lowercase SHA-256 digest')
  }
  return normalized
}

function stringList(value, field, maximumItems = 20, itemMaximum = 120) {
  if (!Array.isArray(value) || !value.length || value.length > maximumItems) {
    throw new AllocationError('INVALID_LIST', field + ' must contain between 1 and ' + maximumItems + ' values')
  }
  return [...new Set(value.map((item) => required(item, field, itemMaximum).toUpperCase()))]
}

function assertPublicSafe(value, label) {
  const privateFindings = scan(value)
  if (privateFindings.length) {
    throw new AllocationError('PRIVATE_FIELD_PROHIBITED', label + ' contains prohibited data: ' + privateFindings.join(', '))
  }
  const financialFindings = scanFinancialPromise(value)
  if (financialFindings.length) {
    throw new AllocationError('FINANCIAL_PROMISE_PROHIBITED', label + ' cannot promise, imply, or market future financial value')
  }
  const text = JSON.stringify(value)
  if (CHARITABLE_CLAIM_PATTERN.test(text)) {
    throw new AllocationError('CHARITABLE_CLAIM_PROHIBITED', label + ' cannot claim a charitable contribution or tax deduction')
  }
}

function brandPublicView(brand) {
  return {
    brandVersionId: brand.brandVersionId,
    version: brand.version,
    displayName: brand.displayName,
    tagline: brand.tagline,
    logoAsset: { ...brand.logoAsset },
    status: brand.status,
    contentHash: brand.contentHash,
    createdAt: brand.createdAt,
  }
}

function campaignView(campaign, committedMinor = 0) {
  return {
    ...campaign,
    allowedCategories: [...campaign.allowedCategories],
    allowedRegions: [...campaign.allowedRegions],
    committedMinor,
    availableMinor: Math.max(0, campaign.budgetMinor - committedMinor),
  }
}

function sponsoredOutcomeView(request) {
  return {
    sponsoredOutcomeRequestId: request.sponsoredOutcomeRequestId,
    sponsorCode: request.sponsorCode,
    campaignId: request.campaignId,
    publicCaseCode: request.publicCaseCode,
    amountMinor: request.amountMinor,
    currency: request.currency,
    status: request.status,
    requestHash: request.requestHash,
    createdAt: request.createdAt,
    charitableDeductionClaimed: false,
    recipientIdentityDisclosed: false,
    publicityRequired: false,
    effectMode: 'DISABLED',
  }
}

function mediaEventPublicView(event, brand) {
  return {
    mediaEventId: event.mediaEventId,
    version: event.version,
    lifecycleState: event.lifecycleState,
    lifecycleLabel: event.lifecycleState.replaceAll('_', ' ').toLowerCase().replace(/^./, (value) => value.toUpperCase()),
    verifiedOutcome: event.lifecycleState === 'OUTCOME_CONFIRMED',
    publicCaseCode: event.publicCaseCode,
    campaignId: event.campaignId,
    headline: event.headline,
    summary: event.summary,
    category: event.category,
    generalizedRegion: event.generalizedRegion,
    amountMinor: event.amountMinor,
    currency: event.currency,
    occurredAt: event.occurredAt,
    sponsor: event.attributionMode === 'ANONYMOUS'
      ? { attributionMode: 'ANONYMOUS' }
      : {
          attributionMode: event.attributionMode,
          displayName: brand.displayName,
          tagline: event.attributionMode === 'SPONSOR_NAME_AND_TAGLINE' ? brand.tagline : null,
          logoAsset: { ...brand.logoAsset },
          brandVersionId: brand.brandVersionId,
        },
  }
}

function movementHandle(value) {
  const normalized = required(value, 'handle', 40).toLowerCase().replace(/^@/, '')
  if (!/^[a-z0-9._-]{2,40}$/.test(normalized)) {
    throw new AllocationError('MOVEMENT_HANDLE_INVALID', 'handle must use 2-40 letters, numbers, dots, underscores, or hyphens')
  }
  return normalized
}

function friendlyLifecycle(value) {
  return String(value).replaceAll('_', ' ').toLowerCase().replace(/^./, (character) => character.toUpperCase())
}

function movementMediaItem(input, index, { imagesOnly = false } = {}) {
  assertAllowedKeys(input, ['altText', 'byteSize', 'fileName', 'mimeType', 'sha256'], `media item ${index + 1}`)
  const fileName = required(input.fileName, `mediaItems[${index}].fileName`, 120)
  if (!/^[A-Za-z0-9][A-Za-z0-9._ -]{0,119}$/.test(fileName)) {
    throw new AllocationError('MOVEMENT_MEDIA_FILE_INVALID', 'media file name must not contain a path or control characters')
  }
  const mimeType = required(input.mimeType, `mediaItems[${index}].mimeType`, 40).toLowerCase()
  if (!MOVEMENT_MEDIA_MIME_TYPES.has(mimeType) || (imagesOnly && !mimeType.startsWith('image/'))) {
    throw new AllocationError('MOVEMENT_MEDIA_TYPE_INVALID', imagesOnly
      ? 'comment attachments must be PNG, JPEG, or WebP'
      : 'movement media must be PNG, JPEG, WebP, MP4, or WebM')
  }
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize < 1 || input.byteSize > 25_000_000) {
    throw new AllocationError('MOVEMENT_MEDIA_SIZE_INVALID', 'each media item must be between 1 byte and 25 MB')
  }
  const mediaSha256 = digest(input.sha256, `mediaItems[${index}].sha256`)
  const item = {
    mediaId: 'movement_media_' + hash({ fileName, mimeType, sha256: mediaSha256, index }).slice(0, 24),
    fileName,
    mimeType,
    byteSize: input.byteSize,
    sha256: mediaSha256,
    altText: required(input.altText, `mediaItems[${index}].altText`, 180),
    storageState: 'LOCAL_PREVIEW_ONLY',
  }
  assertPublicSafe({ fileName: item.fileName, altText: item.altText }, 'movement media')
  return item
}

function movementCommentPublicView(comment) {
  return {
    commentId: comment.commentId,
    postId: comment.postId,
    parentCommentId: comment.parentCommentId,
    account: { ...comment.account },
    text: comment.text,
    attachment: comment.attachment ? { ...comment.attachment } : null,
    createdAt: comment.createdAt,
  }
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
    this.brandVersions = new Map()
    this.campaigns = new Map()
    this.sponsoredOutcomeRequests = new Map()
    this.mediaEvents = new Map()
    this.movementPosts = new Map()
    this.movementComments = new Map()
    this.movementInteractions = new Map()
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

  registerBrandVersion(input) {
    assertAllowedKeys(input, ['actor', 'sponsorCode', 'displayName', 'tagline', 'logoAsset'], 'brand version')
    const code = required(input.sponsorCode, 'sponsorCode', 80).toUpperCase()
    this.authorize(input.actor, code, 'CONFIGURE_BRAND')
    const asset = input.logoAsset
    if (!asset || typeof asset !== 'object' || Array.isArray(asset)) {
      throw new AllocationError('LOGO_ASSET_REQUIRED', 'versioned logo asset metadata is required')
    }
    const expectedAssetKeys = ['altText', 'assetId', 'byteSize', 'fileName', 'mimeType', 'sha256']
    const actualAssetKeys = Object.keys(asset).sort()
    if (hash(actualAssetKeys) !== hash(expectedAssetKeys.sort())) {
      throw new AllocationError('LOGO_ASSET_SHAPE_INVALID', 'logo asset metadata contains unsupported fields')
    }
    const fileName = required(asset.fileName, 'logoAsset.fileName', 120)
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(fileName)) {
      throw new AllocationError('LOGO_FILE_NAME_INVALID', 'logo file name must not contain a path or control characters')
    }
    const mimeType = required(asset.mimeType, 'logoAsset.mimeType', 40).toLowerCase()
    if (!BRAND_MIME_TYPES.has(mimeType)) {
      throw new AllocationError('LOGO_MIME_TYPE_INVALID', 'logo must be PNG, JPEG, or WebP')
    }
    if (!Number.isSafeInteger(asset.byteSize) || asset.byteSize < 1 || asset.byteSize > 5_000_000) {
      throw new AllocationError('LOGO_SIZE_INVALID', 'logo must be between 1 byte and 5 MB')
    }
    const content = {
      sponsorCode: code,
      displayName: required(input.displayName, 'displayName', 120),
      tagline: required(input.tagline, 'tagline', 160),
      logoAsset: {
        assetId: required(asset.assetId, 'logoAsset.assetId', 160),
        fileName,
        mimeType,
        byteSize: asset.byteSize,
        sha256: digest(asset.sha256, 'logoAsset.sha256'),
        altText: required(asset.altText, 'logoAsset.altText', 160),
      },
    }
    assertPublicSafe({
      displayName: content.displayName,
      tagline: content.tagline,
      fileName: content.logoAsset.fileName,
      altText: content.logoAsset.altText,
    }, 'brand version')
    const version = [...this.brandVersions.values()]
      .filter((brand) => brand.sponsorCode === code)
      .reduce((maximum, brand) => Math.max(maximum, brand.version), 0) + 1
    const brand = {
      brandVersionId: uid('brand'),
      version,
      ...content,
      contentHash: hash(content),
      status: 'PENDING_REVIEW',
      createdAt: this.now().toISOString(),
    }
    this.brandVersions.set(brand.brandVersionId, brand)
    this.auditEvent({
      actor: input.actor,
      sponsorCode: code,
      action: 'REGISTER_BRAND_VERSION',
      resourceType: 'SPONSOR_BRAND_VERSION',
      resourceId: brand.brandVersionId,
      details: { version, contentHash: brand.contentHash },
    })
    return brandPublicView(brand)
  }

  recordBrandReview(brandVersionId, input, receipt) {
    const brand = this.brandVersions.get(brandVersionId)
    if (!brand) throw new AllocationError('BRAND_VERSION_NOT_FOUND', 'brand version not found', 404)
    const disposition = {
      outcome: required(input.outcome, 'outcome', 20).toUpperCase(),
      reasonCode: input.reasonCode ?? null,
      reviewPolicyVersion: required(input.reviewPolicyVersion, 'reviewPolicyVersion', 120),
      brandContentHash: digest(input.brandContentHash, 'brandContentHash'),
    }
    if (!['APPROVED', 'REJECTED'].includes(disposition.outcome)) {
      throw new AllocationError('BRAND_REVIEW_OUTCOME_INVALID', 'brand review must be APPROVED or REJECTED')
    }
    if (disposition.brandContentHash !== brand.contentHash) {
      throw new AllocationError('BRAND_CONTENT_DRIFT', 'brand review is not bound to this immutable version', 409)
    }
    const consumed = this.consumeFepReceipt(receipt, {
      contractVersion: 'fep-sponsor-brand-review-v1',
      resourceType: 'SPONSOR_BRAND_VERSION',
      resourceId: brandVersionId,
      payload: disposition,
    })
    if (consumed.replay) return brandPublicView(brand)
    if (brand.status !== 'PENDING_REVIEW') {
      throw new AllocationError('BRAND_VERSION_FINAL', 'brand version review is already final', 409)
    }
    brand.status = disposition.outcome
    brand.reviewPolicyVersion = disposition.reviewPolicyVersion
    brand.reviewReasonCode = disposition.reasonCode
    brand.reviewReceiptId = receipt.receiptId
    this.commitFepReceipt(receipt)
    return brandPublicView(brand)
  }

  listBrandVersions({ actor, sponsorCode }) {
    const code = required(sponsorCode, 'sponsorCode', 80).toUpperCase()
    this.authorize(actor, code, 'VIEW')
    this.auditEvent({ actor, sponsorCode: code, action: 'VIEW_BRAND_VERSIONS', resourceType: 'SPONSOR_BRAND_VERSION_LIST' })
    return [...this.brandVersions.values()]
      .filter((brand) => brand.sponsorCode === code)
      .sort((left, right) => right.version - left.version)
      .map(brandPublicView)
  }

  campaignCommittedMinor(campaignId) {
    return [...this.sponsoredOutcomeRequests.values()]
      .filter((request) => request.campaignId === campaignId && HELD_SPONSORED_OUTCOME_STATUSES.has(request.status))
      .reduce((total, request) => total + request.amountMinor, 0)
  }

  createCampaign(input) {
    assertAllowedKeys(input, [
      'actor', 'sponsorCode', 'brandVersionId', 'fundingRail', 'programId', 'name', 'publicSummary',
      'budgetMinor', 'perOutcomeCapMinor', 'currency', 'allowedCategories', 'allowedRegions', 'startsAt',
      'endsAt', 'attributionMode', 'acknowledgements',
    ], 'campaign')
    const code = required(input.sponsorCode, 'sponsorCode', 80).toUpperCase()
    this.authorize(input.actor, code, 'CONFIGURE_CAMPAIGN')
    const organization = this.organizations.get(code)
    const brand = this.brandVersions.get(input.brandVersionId)
    if (!brand || brand.sponsorCode !== code || brand.status !== 'APPROVED') {
      throw new AllocationError('APPROVED_BRAND_VERSION_REQUIRED', 'campaign requires an approved brand version', 409)
    }
    const fundingRail = required(input.fundingRail, 'fundingRail', 60).toUpperCase()
    if (!CAMPAIGN_RAILS.has(fundingRail)) {
      throw new AllocationError('FUNDING_RAIL_INVALID', 'campaign funding rail is not supported')
    }
    const campaignCurrency = currency(input.currency ?? organization.currency)
    if (campaignCurrency !== organization.currency) {
      throw new AllocationError('CURRENCY_MISMATCH', 'campaign currency does not match sponsor')
    }
    const startsAt = timestamp(input.startsAt, 'startsAt')
    const endsAt = timestamp(input.endsAt, 'endsAt')
    if (Date.parse(endsAt) <= Date.parse(startsAt) || Date.parse(endsAt) - Date.parse(startsAt) > 366 * 24 * 60 * 60 * 1000) {
      throw new AllocationError('CAMPAIGN_WINDOW_INVALID', 'campaign must have a positive window no longer than 366 days')
    }
    const budgetMinor = positiveMinor(input.budgetMinor, 'budgetMinor')
    const perOutcomeCapMinor = positiveMinor(input.perOutcomeCapMinor, 'perOutcomeCapMinor')
    if (perOutcomeCapMinor > budgetMinor) {
      throw new AllocationError('CAMPAIGN_CAP_INVALID', 'per-outcome cap cannot exceed campaign budget')
    }
    const attributionMode = required(input.attributionMode, 'attributionMode', 60).toUpperCase()
    if (!ATTRIBUTION_MODES.has(attributionMode)) {
      throw new AllocationError('ATTRIBUTION_MODE_INVALID', 'campaign attribution mode is not supported')
    }
    const acknowledgements = {
      nonCharitableAcknowledged: input.acknowledgements?.nonCharitableAcknowledged === true,
      noRecipientContact: input.acknowledgements?.noRecipientContact === true,
      noPublicityCondition: input.acknowledgements?.noPublicityCondition === true,
      noCashOutOrExchange: input.acknowledgements?.noCashOutOrExchange === true,
    }
    if (fundingRail === 'SPONSORED_DIRECT_GIFT' && Object.values(acknowledgements).some((value) => !value)) {
      throw new AllocationError(
        'DIRECT_GIFT_ACKNOWLEDGEMENTS_REQUIRED',
        'direct sponsored outcomes require non-charitable, privacy, publicity, and closed-loop acknowledgements',
      )
    }
    let programId = input.programId ?? null
    if (fundingRail === 'GOVERNED_PROGRAM_SUPPORT') {
      const program = this.programs.get(programId)
      if (!program || program.sponsorCode !== code || program.status !== 'ACTIVE') {
        throw new AllocationError('ACTIVE_PROGRAM_REQUIRED', 'governed program support requires an active FEP-approved program', 409)
      }
    } else if (programId !== null) {
      const program = this.programs.get(programId)
      if (!program || program.sponsorCode !== code) throw new AllocationError('PROGRAM_ACCESS_DENIED', 'program not visible', 403)
    }
    const publicCopy = {
      name: required(input.name, 'name', 180),
      publicSummary: required(input.publicSummary, 'publicSummary', 500),
    }
    assertPublicSafe(publicCopy, 'campaign copy')
    const campaignBody = {
      sponsorCode: code,
      brandVersionId: brand.brandVersionId,
      fundingRail,
      programId,
      ...publicCopy,
      budgetMinor,
      perOutcomeCapMinor,
      currency: campaignCurrency,
      allowedCategories: stringList(input.allowedCategories, 'allowedCategories'),
      allowedRegions: Array.isArray(input.allowedRegions)
        ? [...new Set(input.allowedRegions.map((region) => required(region, 'allowedRegions', 120)))]
        : [],
      startsAt,
      endsAt,
      attributionMode,
      acknowledgementHash: hash(acknowledgements),
      effectMode: 'DISABLED',
    }
    const campaign = {
      campaignId: uid('campaign'),
      ...campaignBody,
      campaignHash: hash(campaignBody),
      status: 'DRAFT',
      createdAt: this.now().toISOString(),
    }
    this.campaigns.set(campaign.campaignId, campaign)
    this.auditEvent({
      actor: input.actor,
      sponsorCode: code,
      action: 'CREATE_SPONSOR_CAMPAIGN_DRAFT',
      resourceType: 'SPONSOR_CAMPAIGN',
      resourceId: campaign.campaignId,
      details: { fundingRail, campaignHash: campaign.campaignHash, effectMode: 'DISABLED' },
    })
    return campaignView(campaign)
  }

  submitCampaign(actor, campaignId) {
    const campaign = this.campaigns.get(campaignId)
    if (!campaign) throw new AllocationError('CAMPAIGN_NOT_FOUND', 'campaign not found', 404)
    this.authorize(actor, campaign.sponsorCode, 'CONFIGURE_CAMPAIGN')
    if (campaign.status !== 'DRAFT') throw new AllocationError('CAMPAIGN_STATE_CONFLICT', 'only draft campaigns can be submitted', 409)
    campaign.status = 'SUBMITTED_FOR_FEP_REVIEW'
    this.auditEvent({
      actor,
      sponsorCode: campaign.sponsorCode,
      action: 'SUBMIT_SPONSOR_CAMPAIGN',
      resourceType: 'SPONSOR_CAMPAIGN',
      resourceId: campaignId,
      details: { campaignHash: campaign.campaignHash },
    })
    return campaignView(campaign, this.campaignCommittedMinor(campaignId))
  }

  recordCampaignDisposition(campaignId, input, receipt) {
    const campaign = this.campaigns.get(campaignId)
    if (!campaign) throw new AllocationError('CAMPAIGN_NOT_FOUND', 'campaign not found', 404)
    const disposition = {
      outcome: required(input.outcome, 'outcome', 20).toUpperCase(),
      reasonCode: input.reasonCode ?? null,
      policyVersion: required(input.policyVersion, 'policyVersion', 120),
      campaignHash: digest(input.campaignHash, 'campaignHash'),
    }
    if (!['ACCEPTED', 'REJECTED'].includes(disposition.outcome)) {
      throw new AllocationError('CAMPAIGN_OUTCOME_INVALID', 'campaign outcome must be ACCEPTED or REJECTED')
    }
    if (disposition.campaignHash !== campaign.campaignHash) {
      throw new AllocationError('CAMPAIGN_CONTENT_DRIFT', 'campaign disposition is not bound to this immutable draft', 409)
    }
    const consumed = this.consumeFepReceipt(receipt, {
      contractVersion: 'fep-sponsor-campaign-disposition-v1',
      resourceType: 'SPONSOR_CAMPAIGN',
      resourceId: campaignId,
      payload: disposition,
    })
    if (consumed.replay) return campaignView(campaign, this.campaignCommittedMinor(campaignId))
    if (campaign.status !== 'SUBMITTED_FOR_FEP_REVIEW') {
      throw new AllocationError('CAMPAIGN_STATE_CONFLICT', 'campaign is not awaiting FEP review', 409)
    }
    campaign.status = disposition.outcome === 'ACCEPTED' ? 'ACTIVE' : 'REJECTED_BY_FEP'
    campaign.fepPolicyVersion = disposition.policyVersion
    campaign.fepDispositionReceiptId = receipt.receiptId
    this.commitFepReceipt(receipt)
    return campaignView(campaign, this.campaignCommittedMinor(campaignId))
  }

  listCampaigns({ actor, sponsorCode }) {
    const code = required(sponsorCode, 'sponsorCode', 80).toUpperCase()
    this.authorize(actor, code, 'VIEW')
    this.auditEvent({ actor, sponsorCode: code, action: 'VIEW_SPONSOR_CAMPAIGNS', resourceType: 'SPONSOR_CAMPAIGN_LIST' })
    return [...this.campaigns.values()]
      .filter((campaign) => campaign.sponsorCode === code)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((campaign) => campaignView(campaign, this.campaignCommittedMinor(campaign.campaignId)))
  }

  createSponsoredOutcomeRequest(input) {
    assertAllowedKeys(input, [
      'actor', 'sponsorCode', 'campaignId', 'publicCaseCode', 'amountMinor', 'rationale',
      'correlationId', 'idempotencyKey', 'acknowledgements',
    ], 'sponsored outcome request')
    const code = required(input.sponsorCode, 'sponsorCode', 80).toUpperCase()
    this.authorize(input.actor, code, 'SPONSOR_OUTCOME')
    const campaign = this.campaigns.get(input.campaignId)
    if (!campaign || campaign.sponsorCode !== code) throw new AllocationError('CAMPAIGN_ACCESS_DENIED', 'campaign not visible', 403)
    if (campaign.status !== 'ACTIVE' || campaign.fundingRail !== 'SPONSORED_DIRECT_GIFT') {
      throw new AllocationError('DIRECT_GIFT_CAMPAIGN_REQUIRED', 'specific outcomes require an active direct-gift campaign', 409)
    }
    const now = this.now().getTime()
    if (now < Date.parse(campaign.startsAt) || now > Date.parse(campaign.endsAt)) {
      throw new AllocationError('CAMPAIGN_NOT_IN_WINDOW', 'campaign is outside its approved operating window', 409)
    }
    const publicCaseCode = required(input.publicCaseCode, 'publicCaseCode', 120)
    const card = this.cards.get(publicCaseCode)
    if (!card || card.status !== 'PUBLISHED') throw new AllocationError('CASE_NOT_AVAILABLE', 'public outcome is not available', 409)
    if (!campaign.allowedCategories.includes(card.category) ||
      (campaign.allowedRegions.length && !campaign.allowedRegions.includes(card.generalizedRegion))) {
      throw new AllocationError('CASE_OUTSIDE_CAMPAIGN_SCOPE', 'public outcome is outside the approved campaign scope', 409)
    }
    const amountMinor = positiveMinor(input.amountMinor, 'amountMinor')
    if (amountMinor !== card.requestedAmountMinor || amountMinor > campaign.perOutcomeCapMinor) {
      throw new AllocationError('OUTCOME_AMOUNT_INVALID', 'pilot requests must exactly fund the public amount within the campaign cap', 409)
    }
    const acknowledgements = input.acknowledgements ?? {}
    if (
      acknowledgements.nonCharitableAcknowledged !== true ||
      acknowledgements.noRecipientContact !== true ||
      acknowledgements.noPublicityCondition !== true ||
      acknowledgements.noCashOutOrExchange !== true
    ) {
      throw new AllocationError('DIRECT_GIFT_ACKNOWLEDGEMENTS_REQUIRED', 'all direct-gift acknowledgements are required')
    }
    const idempotencyKey = required(input.idempotencyKey, 'idempotencyKey', 200)
    const command = {
      sponsorCode: code,
      campaignId: campaign.campaignId,
      publicCaseCode,
      publicCardHash: hash(card),
      amountMinor,
      currency: card.currency,
      rationale: input.rationale ? required(input.rationale, 'rationale', 300) : null,
      correlationId: required(input.correlationId, 'correlationId', 200),
      acknowledgementHash: hash(acknowledgements),
      effectMode: 'DISABLED',
    }
    assertPublicSafe({ rationale: command.rationale }, 'sponsored outcome request')
    const requestHash = hash(command)
    const scopedIdempotencyKey = code + ':SPONSORED_OUTCOME:' + idempotencyKey
    const existingReplay = this.idempotency.get(scopedIdempotencyKey)
    if (existingReplay) {
      if (existingReplay.requestHash !== requestHash) {
        throw new AllocationError('IDEMPOTENCY_CONFLICT', 'idempotency key reused with different sponsored outcome request', 409)
      }
      const current = this.sponsoredOutcomeRequests.get(existingReplay.response.sponsoredOutcomeRequestId)
      return { ...(current ? sponsoredOutcomeView(current) : existingReplay.response), idempotentReplay: true }
    }
    const alreadyHeld = [...this.sponsoredOutcomeRequests.values()].some((request) =>
      request.publicCaseCode === publicCaseCode && HELD_SPONSORED_OUTCOME_STATUSES.has(request.status)
    )
    if (alreadyHeld) throw new AllocationError('CASE_NOT_AVAILABLE', 'public outcome is not available', 409)
    if (amountMinor > campaign.budgetMinor - this.campaignCommittedMinor(campaign.campaignId)) {
      throw new AllocationError('CAMPAIGN_BUDGET_INSUFFICIENT', 'campaign budget cannot absorb this outcome request', 409)
    }
    const request = {
      sponsoredOutcomeRequestId: uid('sponsored_outcome'),
      ...command,
      status: 'SUBMITTED_FOR_FEP_REVIEW',
      idempotencyKey,
      requestHash,
      createdAt: this.now().toISOString(),
    }
    this.sponsoredOutcomeRequests.set(request.sponsoredOutcomeRequestId, request)
    this.idempotency.set(scopedIdempotencyKey, { requestHash, response: sponsoredOutcomeView(request) })
    this.auditEvent({
      actor: input.actor,
      sponsorCode: code,
      action: 'CREATE_SPONSORED_OUTCOME_REQUEST',
      resourceType: 'SPONSORED_OUTCOME_REQUEST',
      resourceId: request.sponsoredOutcomeRequestId,
      details: { publicCaseCode, requestHash, amountMinor, effectMode: 'DISABLED' },
    })
    return sponsoredOutcomeView(request)
  }

  recordSponsoredOutcomeDisposition(requestId, input, receipt) {
    const request = this.sponsoredOutcomeRequests.get(requestId)
    if (!request) throw new AllocationError('SPONSORED_OUTCOME_REQUEST_NOT_FOUND', 'sponsored outcome request not found', 404)
    const disposition = {
      outcome: required(input.outcome, 'outcome', 24).toUpperCase(),
      reasonCode: input.reasonCode ?? null,
      policyVersion: required(input.policyVersion, 'policyVersion', 120),
      requestHash: digest(input.requestHash, 'requestHash'),
    }
    if (!['ACCEPTED', 'REJECTED', 'EXPIRED', 'UNAVAILABLE'].includes(disposition.outcome)) {
      throw new AllocationError('SPONSORED_OUTCOME_DISPOSITION_INVALID', 'sponsored outcome disposition is not supported')
    }
    if (disposition.requestHash !== request.requestHash) {
      throw new AllocationError('SPONSORED_OUTCOME_HASH_MISMATCH', 'FEP disposition is not bound to this request', 409)
    }
    const consumed = this.consumeFepReceipt(receipt, {
      contractVersion: 'fep-sponsored-outcome-request-disposition-v1',
      resourceType: 'SPONSORED_OUTCOME_REQUEST',
      resourceId: requestId,
      payload: disposition,
    })
    if (consumed.replay) return { ...sponsoredOutcomeView(request), idempotentReplay: true }
    if (request.status !== 'SUBMITTED_FOR_FEP_REVIEW') {
      throw new AllocationError('SPONSORED_OUTCOME_REQUEST_FINAL', 'request is not awaiting FEP review', 409)
    }
    request.status = disposition.outcome === 'ACCEPTED'
      ? 'ACCEPTED_BY_FEP_NO_EFFECT'
      : disposition.outcome === 'REJECTED'
        ? 'REJECTED_BY_FEP'
        : disposition.outcome === 'EXPIRED'
          ? 'EXPIRED_BY_FEP'
          : 'UNAVAILABLE_BY_FEP'
    request.reasonCode = disposition.reasonCode
    request.fepPolicyVersion = disposition.policyVersion
    request.fepDispositionReceiptId = receipt.receiptId
    this.commitFepReceipt(receipt)
    return sponsoredOutcomeView(request)
  }

  listSponsoredOutcomeRequests({ actor, sponsorCode }) {
    const code = required(sponsorCode, 'sponsorCode', 80).toUpperCase()
    this.authorize(actor, code, 'VIEW')
    this.auditEvent({ actor, sponsorCode: code, action: 'VIEW_SPONSORED_OUTCOME_REQUESTS', resourceType: 'SPONSORED_OUTCOME_REQUEST_LIST' })
    return [...this.sponsoredOutcomeRequests.values()]
      .filter((request) => request.sponsorCode === code)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(sponsoredOutcomeView)
  }

  publishMediaEventProjection(input, receipt) {
    const campaign = this.campaigns.get(input.campaignId)
    const brand = this.brandVersions.get(input.brandVersionId)
    const card = this.cards.get(input.publicCaseCode)
    if (!campaign || !brand || brand.brandVersionId !== campaign.brandVersionId || brand.status !== 'APPROVED') {
      throw new AllocationError('MEDIA_BRAND_BINDING_INVALID', 'media event must pin the campaign approved brand version', 409)
    }
    if (!card || card.status !== 'PUBLISHED') throw new AllocationError('CASE_NOT_AVAILABLE', 'public outcome is not available', 409)
    const lifecycleState = required(input.lifecycleState, 'lifecycleState', 40).toUpperCase()
    if (!MEDIA_LIFECYCLE.includes(lifecycleState)) {
      throw new AllocationError('MEDIA_LIFECYCLE_INVALID', 'media lifecycle state is not supported')
    }
    if (input.publicationConsentVerified !== true) {
      throw new AllocationError('PUBLICATION_CONSENT_REQUIRED', 'media event requires separate verified publication consent')
    }
    const event = {
      mediaEventId: required(input.mediaEventId, 'mediaEventId', 160),
      version: input.version,
      campaignId: campaign.campaignId,
      brandVersionId: brand.brandVersionId,
      publicCaseCode: card.publicCode,
      lifecycleState,
      headline: required(input.headline, 'headline', 180),
      summary: required(input.summary, 'summary', 500),
      category: card.category,
      generalizedRegion: card.generalizedRegion,
      amountMinor: positiveMinor(input.amountMinor, 'amountMinor'),
      currency: currency(input.currency),
      occurredAt: timestamp(input.occurredAt, 'occurredAt'),
      attributionMode: campaign.attributionMode,
      publicationConsentVersion: required(input.publicationConsentVersion, 'publicationConsentVersion', 120),
      sponsorConsentVersion: required(input.sponsorConsentVersion, 'sponsorConsentVersion', 120),
      reconciliationState: required(input.reconciliationState, 'reconciliationState', 40).toUpperCase(),
      status: 'PUBLISHED',
    }
    if (!Number.isSafeInteger(event.version) || event.version < 1) {
      throw new AllocationError('MEDIA_VERSION_INVALID', 'media event version must be an integer >= 1')
    }
    if (event.amountMinor !== card.requestedAmountMinor || event.currency !== card.currency) {
      throw new AllocationError('MEDIA_AMOUNT_DRIFT', 'media event amount and currency must match the public case projection', 409)
    }
    if (['DELIVERED', 'OUTCOME_CONFIRMED'].includes(lifecycleState) && event.reconciliationState !== 'RECONCILED') {
      throw new AllocationError('MEDIA_RECONCILIATION_REQUIRED', 'delivered and confirmed outcome media requires reconciliation', 409)
    }
    assertPublicSafe({ headline: event.headline, summary: event.summary }, 'media event')
    const existing = this.mediaEvents.get(event.mediaEventId)
    const consumed = this.consumeFepReceipt(receipt, {
      contractVersion: 'fep-media-event-v1',
      resourceType: 'MEDIA_EVENT',
      resourceId: event.mediaEventId,
      payload: event,
    })
    if (consumed.replay) return mediaEventPublicView(existing ?? event, brand)
    if (existing) {
      if (event.version !== existing.version + 1) {
        throw new AllocationError('MEDIA_VERSION_CONFLICT', 'media event version must advance by one', 409)
      }
      if (
        event.campaignId !== existing.campaignId ||
        event.brandVersionId !== existing.brandVersionId ||
        event.publicCaseCode !== existing.publicCaseCode
      ) {
        throw new AllocationError('MEDIA_BINDING_DRIFT', 'media event campaign, case, and brand bindings are immutable', 409)
      }
      if (MEDIA_LIFECYCLE.indexOf(event.lifecycleState) !== MEDIA_LIFECYCLE.indexOf(existing.lifecycleState) + 1) {
        throw new AllocationError('MEDIA_LIFECYCLE_JUMP', 'media event lifecycle must advance one verified state at a time', 409)
      }
    } else if (event.version !== 1 || event.lifecycleState !== 'FUNDED') {
      throw new AllocationError('MEDIA_LIFECYCLE_START_INVALID', 'new media events must begin at version 1 and FUNDED', 409)
    }
    this.mediaEvents.set(event.mediaEventId, event)
    this.commitFepReceipt(receipt)
    return mediaEventPublicView(event, brand)
  }

  withdrawMediaEventProjection(mediaEventId, input, receipt) {
    const event = this.mediaEvents.get(mediaEventId)
    if (!event) throw new AllocationError('MEDIA_EVENT_NOT_FOUND', 'media event not found', 404)
    const withdrawal = {
      version: input.version,
      reasonCode: required(input.reasonCode, 'reasonCode', 120),
      withdrawnAt: timestamp(input.withdrawnAt, 'withdrawnAt'),
    }
    const consumed = this.consumeFepReceipt(receipt, {
      contractVersion: 'fep-media-event-withdrawal-v1',
      resourceType: 'MEDIA_EVENT',
      resourceId: mediaEventId,
      payload: withdrawal,
    })
    if (consumed.replay) return { mediaEventId, status: 'WITHDRAWN', version: event.version }
    if (!Number.isSafeInteger(withdrawal.version) || withdrawal.version !== event.version + 1) {
      throw new AllocationError('MEDIA_VERSION_CONFLICT', 'withdrawal version must advance by one', 409)
    }
    event.status = 'WITHDRAWN'
    event.version = withdrawal.version
    event.withdrawalReasonCode = withdrawal.reasonCode
    event.withdrawnAt = withdrawal.withdrawnAt
    event.withdrawalReceiptId = receipt.receiptId
    this.commitFepReceipt(receipt)
    return { mediaEventId, status: 'WITHDRAWN', version: event.version }
  }

  listProofFeed({ actor, sponsorCode }) {
    const code = required(sponsorCode, 'sponsorCode', 80).toUpperCase()
    this.authorize(actor, code, 'VIEW')
    this.auditEvent({ actor, sponsorCode: code, action: 'VIEW_PROOF_FEED', resourceType: 'MEDIA_EVENT_LIST' })
    return [...this.mediaEvents.values()]
      .filter((event) => event.status === 'PUBLISHED' && this.campaigns.get(event.campaignId)?.sponsorCode === code)
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .map((event) => mediaEventPublicView(event, this.brandVersions.get(event.brandVersionId)))
  }

  movementViewerKey(actor) {
    return actor ? hash({ sponsorCode: actor.sponsorCode, subjectId: actor.subjectId }) : null
  }

  movementInteractionRecord(actor) {
    const viewerKey = this.movementViewerKey(actor)
    if (!viewerKey) return null
    if (!this.movementInteractions.has(viewerKey)) {
      this.movementInteractions.set(viewerKey, {
        likedPostIds: new Set(),
        savedPostIds: new Set(),
        sentPostIds: new Set(),
        followedAccountIds: new Set(),
      })
    }
    return this.movementInteractions.get(viewerKey)
  }

  movementEngagement(postId, accountId, actor, kind) {
    const baseline = kind === 'VERIFIED_SUPPORT'
      ? { likeCount: 34, sendCount: 9, saveCount: 14 }
      : { likeCount: 7, sendCount: 2, saveCount: 4 }
    const records = [...this.movementInteractions.values()]
    const comments = [...this.movementComments.values()].filter((comment) => comment.postId === postId)
    const viewer = actor ? this.movementInteractionRecord(actor) : null
    return {
      likeCount: baseline.likeCount + records.filter((record) => record.likedPostIds.has(postId)).length,
      commentCount: comments.length,
      sendCount: baseline.sendCount + records.filter((record) => record.sentPostIds.has(postId)).length,
      saveCount: baseline.saveCount + records.filter((record) => record.savedPostIds.has(postId)).length,
      viewer: {
        liked: Boolean(viewer?.likedPostIds.has(postId)),
        saved: Boolean(viewer?.savedPostIds.has(postId)),
        sent: Boolean(viewer?.sentPostIds.has(postId)),
        following: Boolean(viewer?.followedAccountIds.has(accountId)),
      },
    }
  }

  listMovementFeed({ actor = null, sponsorCode = 'LUZIONE', sort = 'TRENDING' } = {}) {
    const code = required(sponsorCode, 'sponsorCode', 80).toUpperCase()
    if (!this.organizations.has(code)) throw new AllocationError('SPONSOR_NOT_FOUND', 'sponsor not found', 404)
    if (actor) this.authorize(actor, code, 'VIEW')

    const proofPosts = [...this.mediaEvents.values()]
      .filter((event) => event.status === 'PUBLISHED' && this.campaigns.get(event.campaignId)?.sponsorCode === code)
      .map((event) => {
        const brand = this.brandVersions.get(event.brandVersionId)
        const accountId = 'brand:' + brand.brandVersionId
        const postId = 'proof:' + event.mediaEventId
        return {
          postId,
          kind: 'VERIFIED_SUPPORT',
          account: {
            accountId,
            displayName: brand.displayName,
            handle: brand.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 40) || 'luzione',
            avatarText: brand.displayName.slice(0, 1).toUpperCase(),
            verifiedSponsor: true,
          },
          location: event.generalizedRegion,
          headline: event.headline,
          caption: event.summary,
          mediaItems: [{
            mediaId: 'verified:' + event.mediaEventId,
            fileName: event.publicCaseCode.toLowerCase() + '-verified-outcome.jpg',
            mimeType: 'image/jpeg',
            altText: event.headline,
            storageState: 'FEP_VERIFIED_PROJECTION',
          }],
          mediaPresentation: 'VERIFIED_OUTCOME',
          publicCaseCode: event.publicCaseCode,
          createdAt: event.occurredAt,
          lifecycleState: event.lifecycleState,
          verification: {
            status: event.lifecycleState === 'OUTCOME_CONFIRMED' ? 'VERIFIED_OUTCOME' : 'VERIFIED_PROGRESS',
            label: event.lifecycleState === 'OUTCOME_CONFIRMED' ? 'Outcome confirmed' : friendlyLifecycle(event.lifecycleState),
            acknowledgement: 'FEP receipt verified and publication consent recorded',
            requirements: ['Masked identity', 'Exact lifecycle state', 'Separate publication consent'],
          },
          funding: {
            amountMinor: event.amountMinor,
            currency: event.currency,
            sponsorDisplayName: event.attributionMode === 'ANONYMOUS' ? null : brand.displayName,
          },
          comments: [...this.movementComments.values()]
            .filter((comment) => comment.postId === postId)
            .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
            .map(movementCommentPublicView),
          engagement: this.movementEngagement(postId, accountId, actor, 'VERIFIED_SUPPORT'),
        }
      })

    const voluntaryPosts = [...this.movementPosts.values()]
      .filter((post) => post.sponsorCode === code && post.status === 'PUBLISHED')
      .map((post) => ({
        postId: post.postId,
        kind: 'VOLUNTARY_UPDATE',
        account: { ...post.account },
        location: post.location,
        headline: null,
        caption: post.caption,
        mediaItems: post.mediaItems.map((item) => ({ ...item })),
        mediaPresentation: post.mediaItems.length > 1
          ? 'SLIDESHOW'
          : post.mediaItems[0].mimeType.startsWith('video/') ? 'VIDEO' : 'PHOTO',
        publicCaseCode: post.publicCaseCode,
        createdAt: post.createdAt,
        lifecycleState: null,
        verification: {
          status: post.publicCaseCode ? 'LINKED_VOLUNTARY_UPDATE' : 'VOLUNTARY_UPDATE',
          label: post.publicCaseCode ? 'Linked to a public case code' : 'Community update',
          acknowledgement: 'Author publication consent recorded',
          requirements: ['Account attribution', 'Public-safe content scan', 'Publication consent'],
        },
        funding: null,
        comments: [...this.movementComments.values()]
          .filter((comment) => comment.postId === post.postId)
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
          .map(movementCommentPublicView),
        engagement: this.movementEngagement(post.postId, post.account.accountId, actor, 'VOLUNTARY_UPDATE'),
      }))

    const posts = [...proofPosts, ...voluntaryPosts]
    const normalizedSort = String(sort).toUpperCase()
    if (normalizedSort === 'LATEST') posts.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    else if (normalizedSort === 'FOLLOWING' && actor) {
      const viewer = this.movementInteractionRecord(actor)
      posts.sort((left, right) => Number(viewer.followedAccountIds.has(right.account.accountId)) - Number(viewer.followedAccountIds.has(left.account.accountId)) || right.createdAt.localeCompare(left.createdAt))
    } else {
      posts.sort((left, right) => {
        const rightScore = right.engagement.likeCount + (right.engagement.commentCount * 3) + (right.engagement.sendCount * 2)
        const leftScore = left.engagement.likeCount + (left.engagement.commentCount * 3) + (left.engagement.sendCount * 2)
        return rightScore - leftScore || right.createdAt.localeCompare(left.createdAt)
      })
    }
    if (actor) this.auditEvent({ actor, sponsorCode: code, action: 'VIEW_MOVEMENT_FEED', resourceType: 'MOVEMENT_POST_LIST' })
    return posts
  }

  createMovementPost(input) {
    assertAllowedKeys(input, [
      'actor', 'sponsorCode', 'displayName', 'handle', 'location', 'caption', 'mediaItems',
      'publicCaseCode', 'publicationConsentVerified', 'idempotencyKey',
    ], 'movement post')
    const code = required(input.sponsorCode, 'sponsorCode', 80).toUpperCase()
    this.authorize(input.actor, code, 'POST_MOVEMENT_UPDATE')
    if (input.publicationConsentVerified !== true) {
      throw new AllocationError('PUBLICATION_CONSENT_REQUIRED', 'movement updates require explicit publication consent')
    }
    if (!Array.isArray(input.mediaItems) || !input.mediaItems.length || input.mediaItems.length > 10) {
      throw new AllocationError('MOVEMENT_MEDIA_REQUIRED', 'movement updates require 1-10 media items')
    }
    const mediaItems = input.mediaItems.map((item, index) => movementMediaItem(item, index))
    const videoItems = mediaItems.filter((item) => item.mimeType.startsWith('video/'))
    if (videoItems.length && (videoItems.length !== 1 || mediaItems.length !== 1)) {
      throw new AllocationError('MOVEMENT_MEDIA_MIX_INVALID', 'a video post must contain exactly one video; slideshows contain images only')
    }
    const publicCaseCode = input.publicCaseCode ? required(input.publicCaseCode, 'publicCaseCode', 120) : null
    if (publicCaseCode) {
      const card = this.cards.get(publicCaseCode)
      if (!card || card.status !== 'PUBLISHED') throw new AllocationError('CASE_NOT_AVAILABLE', 'linked public case code is not available', 409)
    }
    const account = {
      accountId: 'movement_account_' + hash({ sponsorCode: code, subjectId: input.actor.subjectId }).slice(0, 20),
      displayName: required(input.displayName, 'displayName', 80),
      handle: movementHandle(input.handle),
      avatarText: required(input.displayName, 'displayName', 80).slice(0, 1).toUpperCase(),
      verifiedSponsor: false,
    }
    const command = {
      sponsorCode: code,
      account,
      location: required(input.location, 'location', 120),
      caption: required(input.caption, 'caption', 500),
      mediaItems,
      publicCaseCode,
      publicationConsentVerified: true,
    }
    assertPublicSafe({
      displayName: account.displayName,
      handle: account.handle,
      location: command.location,
      caption: command.caption,
      mediaText: mediaItems.map((item) => ({ fileName: item.fileName, altText: item.altText })),
    }, 'movement post')
    const idempotencyKey = required(input.idempotencyKey, 'idempotencyKey', 200)
    const requestHash = hash(command)
    const scopedKey = code + ':MOVEMENT_POST:' + idempotencyKey
    const existing = this.idempotency.get(scopedKey)
    if (existing) {
      if (existing.requestHash !== requestHash) throw new AllocationError('IDEMPOTENCY_CONFLICT', 'idempotency key reused with different movement post', 409)
      return { ...existing.response, idempotentReplay: true }
    }
    const post = {
      postId: uid('movement_post'),
      ...command,
      status: 'PUBLISHED',
      createdAt: this.now().toISOString(),
      requestHash,
    }
    this.movementPosts.set(post.postId, post)
    const response = this.listMovementFeed({ actor: input.actor, sponsorCode: code, sort: 'LATEST' })
      .find((item) => item.postId === post.postId)
    this.idempotency.set(scopedKey, { requestHash, response })
    this.auditEvent({
      actor: input.actor,
      sponsorCode: code,
      action: 'PUBLISH_MOVEMENT_UPDATE',
      resourceType: 'MOVEMENT_POST',
      resourceId: post.postId,
      details: { publicCaseCode, mediaCount: mediaItems.length, mediaPresentation: response.mediaPresentation },
    })
    return response
  }

  createMovementComment(input) {
    assertAllowedKeys(input, [
      'actor', 'sponsorCode', 'postId', 'parentCommentId', 'displayName', 'handle', 'text', 'attachment',
    ], 'movement comment')
    const code = required(input.sponsorCode, 'sponsorCode', 80).toUpperCase()
    this.authorize(input.actor, code, 'ENGAGE_MOVEMENT')
    const postId = required(input.postId, 'postId', 200)
    const post = this.listMovementFeed({ sponsorCode: code }).find((item) => item.postId === postId)
    if (!post) throw new AllocationError('MOVEMENT_POST_NOT_FOUND', 'movement post not found', 404)
    const parentCommentId = input.parentCommentId ? required(input.parentCommentId, 'parentCommentId', 200) : null
    if (parentCommentId) {
      const parent = this.movementComments.get(parentCommentId)
      if (!parent || parent.postId !== postId) throw new AllocationError('MOVEMENT_COMMENT_PARENT_INVALID', 'comment thread parent is not available', 409)
    }
    const attachment = input.attachment ? movementMediaItem(input.attachment, 0, { imagesOnly: true }) : null
    const comment = {
      commentId: uid('movement_comment'),
      sponsorCode: code,
      postId,
      parentCommentId,
      account: {
        accountId: 'movement_account_' + hash({ sponsorCode: code, subjectId: input.actor.subjectId }).slice(0, 20),
        displayName: required(input.displayName, 'displayName', 80),
        handle: movementHandle(input.handle),
        avatarText: required(input.displayName, 'displayName', 80).slice(0, 1).toUpperCase(),
      },
      text: required(input.text, 'text', 400),
      attachment,
      createdAt: this.now().toISOString(),
    }
    assertPublicSafe({
      displayName: comment.account.displayName,
      handle: comment.account.handle,
      text: comment.text,
      attachmentText: attachment ? { fileName: attachment.fileName, altText: attachment.altText } : null,
    }, 'movement comment')
    this.movementComments.set(comment.commentId, comment)
    this.auditEvent({ actor: input.actor, sponsorCode: code, action: 'CREATE_MOVEMENT_COMMENT', resourceType: 'MOVEMENT_COMMENT', resourceId: comment.commentId, details: { postId, parentCommentId } })
    return movementCommentPublicView(comment)
  }

  toggleMovementInteraction(input) {
    assertAllowedKeys(input, ['actor', 'sponsorCode', 'postId', 'accountId', 'action'], 'movement interaction')
    const code = required(input.sponsorCode, 'sponsorCode', 80).toUpperCase()
    this.authorize(input.actor, code, 'ENGAGE_MOVEMENT')
    const postId = required(input.postId, 'postId', 200)
    const post = this.listMovementFeed({ sponsorCode: code }).find((item) => item.postId === postId)
    if (!post) throw new AllocationError('MOVEMENT_POST_NOT_FOUND', 'movement post not found', 404)
    const action = required(input.action, 'action', 20).toUpperCase()
    if (!MOVEMENT_INTERACTIONS.has(action)) throw new AllocationError('MOVEMENT_INTERACTION_INVALID', 'interaction must be LIKE, SAVE, SEND, or FOLLOW')
    const record = this.movementInteractionRecord(input.actor)
    let active = true
    if (action === 'FOLLOW') {
      const accountId = required(input.accountId, 'accountId', 200)
      if (accountId !== post.account.accountId) throw new AllocationError('MOVEMENT_ACCOUNT_MISMATCH', 'follow target does not match the post account', 409)
      if (record.followedAccountIds.has(accountId)) {
        record.followedAccountIds.delete(accountId)
        active = false
      } else record.followedAccountIds.add(accountId)
    } else {
      const collection = action === 'LIKE'
        ? record.likedPostIds
        : action === 'SAVE' ? record.savedPostIds : record.sentPostIds
      if (action !== 'SEND' && collection.has(postId)) {
        collection.delete(postId)
        active = false
      } else collection.add(postId)
    }
    this.auditEvent({ actor: input.actor, sponsorCode: code, action: action + '_MOVEMENT_POST', resourceType: 'MOVEMENT_POST', resourceId: postId })
    return { postId, action, active }
  }

  getSupportLedger({ actor, sponsorCode }) {
    const code = required(sponsorCode, 'sponsorCode', 80).toUpperCase()
    this.authorize(actor, code, 'VIEW')
    const entries = [...this.sponsoredOutcomeRequests.values()]
      .filter((request) => request.sponsorCode === code)
      .map((request) => {
        const campaign = this.campaigns.get(request.campaignId)
        const media = [...this.mediaEvents.values()].find((event) =>
          event.publicCaseCode === request.publicCaseCode && event.campaignId === request.campaignId && event.status === 'PUBLISHED'
        )
        return {
          ledgerEntryId: 'ledger:' + request.sponsoredOutcomeRequestId,
          publicCaseCode: request.publicCaseCode,
          campaignName: campaign?.name ?? request.campaignId,
          amountMinor: request.amountMinor,
          currency: request.currency,
          recordedAt: request.createdAt,
          currentState: media?.lifecycleState ?? request.status,
          receiptAcknowledgement: request.status === 'ACCEPTED_BY_FEP_NO_EFFECT'
            ? 'FEP accepted the request; this G0 build made no payment or provider effect.'
            : 'Awaiting or reflecting FEP disposition.',
          validationRequirements: [
            { label: 'Exact public amount', status: 'PASS' },
            { label: 'Masked identity', status: 'PASS' },
            { label: 'No publicity condition', status: 'PASS' },
            { label: 'FEP disposition', status: request.status === 'ACCEPTED_BY_FEP_NO_EFFECT' ? 'PASS' : 'PENDING' },
          ],
          optionalPublicPosting: media ? 'PUBLISHED_WITH_SEPARATE_CONSENT' : 'NOT_POSTED',
          effectMode: 'DISABLED',
        }
      })
      .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
    this.auditEvent({ actor, sponsorCode: code, action: 'VIEW_SUPPORT_LEDGER', resourceType: 'SUPPORT_LEDGER' })
    return entries
  }

  getPriorityQueue({ actor, sponsorCode, programId }) {
    const code = required(sponsorCode, 'sponsorCode', 80).toUpperCase()
    this.authorize(actor, code, 'VIEW')
    const program = this.programs.get(programId)
    if (!program || program.sponsorCode !== code || program.status !== 'ACTIVE') {
      throw new AllocationError('PROGRAM_ACCESS_DENIED', 'program not visible', 403)
    }
    const queue = [...this.cards.values()]
      .filter((card) => card.status === 'PUBLISHED' && program.allowedCategories.includes(card.category))
      .map((card, index) => ({
        maskedCaseId: 'FEP-' + hash({ publicCode: card.publicCode }).slice(0, 8).toUpperCase(),
        publicCaseCode: card.publicCode,
        needCategory: card.category,
        needSummary: card.summary,
        generalizedRegion: card.generalizedRegion,
        requestedAmountMinor: card.requestedAmountMinor,
        currency: card.currency,
        necessityBand: index === 0 ? 'IMMEDIATE' : 'NEAR_TERM',
        queuePosition: index + 1,
        prioritizationState: index === 0 ? 'FEP_REVIEWED_READY' : 'AWAITING_CAPACITY_REVIEW',
        priorityFactors: index === 0
          ? ['START_DATE_PROXIMITY', 'REQUIRED_SAFETY_EQUIPMENT', 'VERIFIED_WORK_CONTEXT']
          : ['TRANSPORT_CONTINUITY', 'FIRST_MONTH_OF_WORK', 'VERIFIED_WORK_CONTEXT'],
        identityExposure: 'MASKED',
        selectionAuthority: 'FEP_HUMAN_REVIEW',
        sultanRole: 'DECISION_SUPPORT_ONLY',
        sponsorCanSelectPerson: false,
      }))
      .sort((left, right) => left.queuePosition - right.queuePosition)
    this.auditEvent({ actor, sponsorCode: code, action: 'VIEW_PRIORITY_QUEUE', resourceType: 'FEP_PRIORITY_QUEUE', resourceId: programId })
    return queue
  }

  getPlatformStatus({ actor, sponsorCode }) {
    const code = required(sponsorCode, 'sponsorCode', 80).toUpperCase()
    this.authorize(actor, code, 'VIEW')
    const impactRecords = [...this.impact.values()].filter((projection) =>
      this.programs.get(projection.programId)?.sponsorCode === code && !projection.suppressed
    )
    const proofEvents = [...this.mediaEvents.values()].filter((event) =>
      event.status === 'PUBLISHED' && this.campaigns.get(event.campaignId)?.sponsorCode === code
    )
    const today = this.now().toISOString().slice(0, 10)
    const todayEvents = proofEvents.filter((event) => event.occurredAt.startsWith(today))
    const overall = impactRecords.reduce((totals, projection) => ({
      acceptedAllocationMinor: totals.acceptedAllocationMinor + Number(projection.metrics.acceptedAllocationMinor ?? 0),
      fulfilledCaseCount: totals.fulfilledCaseCount + Number(projection.metrics.fulfilledCaseCount ?? 0),
      verifiedOutcomeCount: totals.verifiedOutcomeCount + Number(projection.metrics.verifiedOutcomeCount ?? 0),
    }), { acceptedAllocationMinor: 0, fulfilledCaseCount: 0, verifiedOutcomeCount: 0 })
    const result = {
      visibility: 'INTERNAL_FEP_OS',
      overallImpact: { ...overall, currency: this.organizations.get(code).currency },
      dailyImpact: {
        date: today,
        verifiedFeedEvents: todayEvents.length,
        confirmedOutcomes: todayEvents.filter((event) => event.lifecycleState === 'OUTCOME_CONFIRMED').length,
        acknowledgedAmountMinor: todayEvents.reduce((total, event) => total + event.amountMinor, 0),
        currency: this.organizations.get(code).currency,
      },
      governance: {
        verifiedReceiptCount: this.fepReceipts.size,
        publicEventsWithConsent: proofEvents.length,
        withdrawnPublicEvents: [...this.mediaEvents.values()].filter((event) => event.status === 'WITHDRAWN').length,
        auditEventCount: this.audit.filter((event) => event.sponsorCode === code).length,
        namedRecipientSelection: false,
        rawEvidenceInPublicApp: false,
      },
      systemHealth: [
        { system: 'Allocation command integrity', status: 'VERIFIED_IN_CI', detail: 'Deterministic and durable replay proof is enforced.' },
        { system: 'FEP receipt verification', status: 'SIMULATED_PASS', detail: 'Signed-fixture verification is active; live FEP verification remains an integration gate.' },
        { system: 'Identity masking and consent', status: 'PASS', detail: 'Public projections expose case codes and generalized regions only.' },
        { system: 'Durable post media', status: 'NOT_CONNECTED', detail: 'Photo and video selection works as a local preview; durable object storage is not configured.' },
        { system: 'Money and provider effects', status: 'DISABLED', detail: 'No settlement, gift-card, merchant, or provider effect is enabled in G0.' },
      ],
      evaluations: [
        { name: 'B07 deterministic allocation', status: 'PASS', evidence: 'Exact payload, snapshot, allocation, and adapter hashes.' },
        { name: 'Concurrent durable delivery', status: 'PASS', evidence: 'One effect and replay-safe duplicates under concurrent delivery.' },
        { name: 'Public data boundary', status: 'PASS', evidence: 'PII, named-recipient, financial-promise, and misleading charitable-claim checks.' },
        { name: 'Rendered browser walkthrough', status: 'PENDING', evidence: 'Requires a discoverable hosted preview or browser runtime.' },
      ],
      knowledge: [
        { title: 'Program operating model', state: 'CURRENT', summary: 'Luzione app publishes consented movement media; FEP OS governs identity, priority, allocation, receipts, and proof.' },
        { title: 'Recipient selection authority', state: 'BOUNDARY', summary: 'Sponsors choose an approved program, reviewed cohort, or public case code. FEP retains the hidden-person decision.' },
        { title: 'Value system', state: 'BOUNDARY', summary: 'Impact Points are recognition only. Essentials Credits remain a future funded, closed-loop access instrument.' },
        { title: 'Production gates', state: 'OPEN', summary: 'Live identity, durable database and media, settlement provider, funded inventory, legal review, and pilot operations.' },
      ],
    }
    this.auditEvent({ actor, sponsorCode: code, action: 'VIEW_PLATFORM_STATUS', resourceType: 'FEP_PLATFORM_STATUS' })
    return result
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
