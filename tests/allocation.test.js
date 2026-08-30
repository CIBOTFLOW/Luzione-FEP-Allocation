import test from 'node:test'
import assert from 'node:assert/strict'

import { hash } from '../src/canonical.js'
import {
  AllocationService,
  createFixtureFepReceipt,
} from '../src/allocationService.js'

const verifyFixture = (receipt) =>
  receipt.signature === 'DEMO_VERIFIED_BY_INJECTED_FIXTURE_VERIFIER'

function receipt(contractVersion, resourceType, resourceId, payload, overrides = {}) {
  return {
    ...createFixtureFepReceipt({ contractVersion, resourceType, resourceId, payload }),
    ...overrides,
  }
}

function fixture({ available = 100000, minimumCohortSize = 10 } = {}) {
  const service = new AllocationService({
    minimumCohortSize,
    verifyFepReceipt: verifyFixture,
    now: () => new Date('2026-08-30T00:00:00.000Z'),
  })
  service.createOrganization({ code: 'ACME', name: 'Acme', currency: 'USD' })
  service.createOrganization({ code: 'OTHER', name: 'Other', currency: 'USD' })
  service.addMembership({ sponsorCode: 'ACME', subjectId: 'admin-1', role: 'ADMIN' })
  service.addMembership({ sponsorCode: 'ACME', subjectId: 'viewer-1', role: 'VIEWER' })
  service.addMembership({ sponsorCode: 'OTHER', subjectId: 'other-admin', role: 'ADMIN' })
  const actor = service.actor('ACME', 'admin-1')
  const viewer = service.actor('ACME', 'viewer-1')
  const otherActor = service.actor('OTHER', 'other-admin')

  const balance = {
    projectionVersion: 1,
    settledAllocationMinor: available,
    committedAllocationMinor: 0,
    currency: 'USD',
    acceptedIntentIds: [],
    asOf: '2026-08-30T00:00:00.000Z',
  }
  service.recordFepAllocationProjection(
    'ACME',
    balance,
    receipt('fep-allocation-balance-v1', 'SPONSOR_ALLOCATION', 'ACME', balance),
  )

  const program = service.createProgram({
    actor,
    sponsorCode: 'ACME',
    name: 'Work',
    allowedCategories: ['WORK_ENABLEMENT'],
    allowedRegions: ['US-CA-SAN-MATEO'],
    currency: 'USD',
  })
  service.submitProgram(actor, program.programId)
  const programDisposition = {
    outcome: 'ACCEPTED',
    policyVersion: 'policy-v1',
    reasonCode: null,
  }
  service.recordFepProgramDisposition(
    program.programId,
    programDisposition,
    receipt('fep-program-disposition-v1', 'PROGRAM', program.programId, programDisposition),
  )

  return { service, actor, viewer, otherActor, program }
}

function publishCohort(service, program, overrides = {}) {
  const input = {
    cohortId: 'cohort-1',
    programId: program.programId,
    version: 1,
    name: 'Reviewed worker cohort',
    dimensions: ['WORK_STATUS_CONTEXT'],
    criteria: { WORK_STATUS_CONTEXT: 'JOB_AT_RISK' },
    eligibleCount: 20,
    ...overrides,
  }
  const projection = {
    cohortId: input.cohortId,
    programId: input.programId,
    version: input.version,
    name: input.name,
    dimensions: [...input.dimensions],
    criteria: input.criteria,
    eligibleCount: input.eligibleCount,
    status: 'APPROVED',
    contentHash: hash(input),
  }
  return service.publishReviewedCohort(
    input,
    receipt('fep-reviewed-cohort-v1', 'COHORT', input.cohortId, projection),
  )
}

function publishCard(service, overrides = {}) {
  const input = {
    publicCode: 'CARD-1',
    category: 'WORK_ENABLEMENT',
    headline: 'Required work boots',
    generalizedRegion: 'US-CA-SAN-MATEO',
    approvedCohortTags: ['WORK_STATUS_CONTEXT:JOB_AT_RISK'],
    requestedAmountMinor: 16500,
    currency: 'USD',
    summary: 'Verified work equipment request.',
    consentVerified: true,
    reviewPolicyVersion: 'public-v1',
    ...overrides,
  }
  const projection = {
    ...input,
    approvedCohortTags: [...input.approvedCohortTags],
    status: 'PUBLISHED',
  }
  return service.publishPublicCardProjection(
    input,
    receipt('fep-public-case-card-v1', 'PUBLIC_CASE_CARD', input.publicCode, projection),
  )
}

function intent(service, actor, program, overrides = {}) {
  return service.createAllocationIntent({
    actor,
    sponsorCode: 'ACME',
    programId: program.programId,
    targetType: 'PROGRAM',
    amountMinor: 10000,
    idempotencyKey: 'intent-key-1',
    correlationId: 'correlation-1',
    ...overrides,
  })
}

test('recursive canonical hashes are independent of nested object key order', () => {
  assert.equal(
    hash({ a: { c: 2, b: 1 }, d: [{ y: 2, x: 1 }] }),
    hash({ d: [{ x: 1, y: 2 }], a: { b: 1, c: 2 } }),
  )
})

test('cross-tenant actors cannot inspect sponsor resources', () => {
  const { service, otherActor, program } = fixture()
  assert.throws(
    () => service.listCards({
      actor: otherActor,
      sponsorCode: 'ACME',
      programId: program.programId,
    }),
    (error) => error.code === 'TENANT_ACCESS_DENIED' && error.status === 403,
  )
})

test('viewer memberships cannot create allocation intents', () => {
  const { service, viewer, program } = fixture()
  assert.throws(
    () => intent(service, viewer, program),
    (error) => error.code === 'ROLE_ACCESS_DENIED',
  )
})

test('public cards require verified FEP receipts and return only public-safe fields', () => {
  const { service, actor, program } = fixture()
  const projected = publishCard(service)
  assert.equal(projected.consentVerified, undefined)
  assert.equal(projected.reviewPolicyVersion, undefined)
  const visible = service.listCards({ actor, sponsorCode: 'ACME', programId: program.programId })
  assert.equal(visible.length, 1)
  assert.equal(visible[0].publicCode, 'CARD-1')
})

test('PII-like values are rejected even under otherwise allowed public fields', () => {
  const { service } = fixture()
  assert.throws(
    () => publishCard(service, { summary: 'Contact person@example.com for details.' }),
    (error) => error.code === 'PRIVATE_FIELD_PROHIBITED',
  )
})

test('unapproved public-card fields are rejected fail closed', () => {
  const { service } = fixture()
  assert.throws(
    () => publishCard(service, { exact_address: '1 Main Street' }),
    (error) => error.code === 'PRIVATE_FIELD_PROHIBITED',
  )
})

test('small reviewed cohorts cannot become sponsor targets', () => {
  const { service, program } = fixture()
  assert.throws(
    () => publishCohort(service, program, { eligibleCount: 4 }),
    (error) => error.code === 'COHORT_TOO_SMALL',
  )
})

test('named recipient and public-card allocation targets are prohibited', () => {
  const { service, actor, program } = fixture()
  publishCard(service)
  assert.throws(
    () => intent(service, actor, program, {
      targetType: 'PUBLIC_CASE_CARD',
      publicCode: 'CARD-1',
    }),
    (error) => error.code === 'NAMED_RECIPIENT_TARGET_PROHIBITED' && error.status === 403,
  )
})

test('program and broad reviewed cohort intents are allowed', () => {
  const { service, actor, program } = fixture()
  const cohort = publishCohort(service, program)
  assert.equal(intent(service, actor, program).targetType, 'PROGRAM')
  assert.equal(intent(service, actor, program, {
    targetType: 'COHORT',
    cohortId: cohort.cohortId,
    amountMinor: 12000,
    idempotencyKey: 'intent-key-2',
  }).targetRef, cohort.cohortId)
})

test('pending intents hold projected availability and prevent aggregate overcommitment', () => {
  const { service, actor, program } = fixture({ available: 100000 })
  intent(service, actor, program, { amountMinor: 70000 })
  assert.equal(service.getOverview({ actor, sponsorCode: 'ACME' }).intentableAllocationMinor, 30000)
  assert.throws(
    () => intent(service, actor, program, {
      amountMinor: 40000,
      idempotencyKey: 'intent-key-2',
    }),
    (error) => error.code === 'INSUFFICIENT_ALLOCATION',
  )
})

test('intent replay is idempotent even while its amount is held', () => {
  const { service, actor, program } = fixture({ available: 100000 })
  const first = intent(service, actor, program, { amountMinor: 70000 })
  const replay = intent(service, actor, program, { amountMinor: 70000 })
  assert.equal(replay.allocationIntentId, first.allocationIntentId)
  assert.equal(replay.idempotentReplay, true)
})

test('FEP acceptance remains held until a later allocation projection reconciles it', () => {
  const { service, actor, program } = fixture({ available: 100000 })
  const created = intent(service, actor, program, { amountMinor: 70000 })
  const disposition = {
    outcome: 'ACCEPTED',
    reasonCode: 'POLICY_ELIGIBLE',
    policyVersion: 'policy-v1',
    intentRequestHash: created.requestHash,
  }
  service.recordFepIntentDisposition(
    created.allocationIntentId,
    disposition,
    receipt(
      'fep-allocation-intent-disposition-v1',
      'ALLOCATION_INTENT',
      created.allocationIntentId,
      disposition,
    ),
  )
  assert.equal(service.getOverview({ actor, sponsorCode: 'ACME' }).heldIntentMinor, 70000)

  const projection = {
    projectionVersion: 2,
    settledAllocationMinor: 100000,
    committedAllocationMinor: 70000,
    currency: 'USD',
    acceptedIntentIds: [created.allocationIntentId],
    asOf: '2026-08-30T01:00:00.000Z',
  }
  service.recordFepAllocationProjection(
    'ACME',
    projection,
    receipt('fep-allocation-balance-v1', 'SPONSOR_ALLOCATION', 'ACME', projection),
  )
  const overview = service.getOverview({ actor, sponsorCode: 'ACME' })
  assert.equal(overview.fepReportedAvailableAllocationMinor, 30000)
  assert.equal(overview.heldIntentMinor, 0)
  assert.equal(overview.intentableAllocationMinor, 30000)
})

test('rejected FEP dispositions release local intent holds without changing FEP balance', () => {
  const { service, actor, program } = fixture({ available: 100000 })
  const created = intent(service, actor, program, { amountMinor: 70000 })
  const disposition = {
    outcome: 'REJECTED',
    reasonCode: 'OUTSIDE_PROGRAM_SCOPE',
    policyVersion: 'policy-v1',
    intentRequestHash: created.requestHash,
  }
  service.recordFepIntentDisposition(
    created.allocationIntentId,
    disposition,
    receipt(
      'fep-allocation-intent-disposition-v1',
      'ALLOCATION_INTENT',
      created.allocationIntentId,
      disposition,
    ),
  )
  const overview = service.getOverview({ actor, sponsorCode: 'ACME' })
  assert.equal(overview.fepReportedAvailableAllocationMinor, 100000)
  assert.equal(overview.intentableAllocationMinor, 100000)
})

test('unverified, tampered, and stale FEP projections fail closed', () => {
  const { service } = fixture()
  const stale = {
    projectionVersion: 1,
    settledAllocationMinor: 100000,
    committedAllocationMinor: 0,
    currency: 'USD',
    acceptedIntentIds: [],
    asOf: '2026-08-30T02:00:00.000Z',
  }
  assert.throws(
    () => service.recordFepAllocationProjection(
      'ACME',
      stale,
      receipt('fep-allocation-balance-v1', 'SPONSOR_ALLOCATION', 'ACME', stale),
    ),
    (error) => error.code === 'STALE_FEP_PROJECTION',
  )

  const next = { ...stale, projectionVersion: 2 }
  const tampered = receipt('fep-allocation-balance-v1', 'SPONSOR_ALLOCATION', 'ACME', next)
  tampered.payloadHash = '0'.repeat(64)
  assert.throws(
    () => service.recordFepAllocationProjection('ACME', next, tampered),
    (error) => error.code === 'FEP_PAYLOAD_HASH_MISMATCH',
  )

  const noVerifier = new AllocationService()
  noVerifier.createOrganization({ code: 'ACME', name: 'Acme', currency: 'USD' })
  assert.throws(
    () => noVerifier.recordFepAllocationProjection(
      'ACME',
      next,
      receipt('fep-allocation-balance-v1', 'SPONSOR_ALLOCATION', 'ACME', next),
    ),
    (error) => error.code === 'FEP_SIGNATURE_UNVERIFIED',
  )
})

test('small impact cohorts suppress all metrics', () => {
  const { service, actor, program } = fixture()
  const projection = {
    programId: program.programId,
    projectionVersion: 1,
    cohortCount: 4,
    metrics: { fulfilledCaseCount: 4 },
    asOf: '2026-08-30T03:00:00.000Z',
  }
  service.recordImpactProjection(
    'ACME',
    projection,
    receipt('fep-aggregate-impact-v1', 'PROGRAM_IMPACT', program.programId, projection),
  )
  const result = service.getImpact({ actor, sponsorCode: 'ACME', programId: program.programId })
  assert.equal(result.suppressed, true)
  assert.equal(result.metrics, undefined)
})

test('sponsor view and mutation actions are recorded in a tenant audit trail', () => {
  const { service, actor, program } = fixture()
  service.getOverview({ actor, sponsorCode: 'ACME' })
  service.listPrograms({ actor, sponsorCode: 'ACME' })
  intent(service, actor, program)
  const events = service.listAudit({ actor, sponsorCode: 'ACME' })
  assert.ok(events.some((event) => event.action === 'VIEW_OVERVIEW'))
  assert.ok(events.some((event) => event.action === 'CREATE_ALLOCATION_INTENT'))
  assert.ok(events.every((event) => event.actorSubjectHash && !('subjectId' in event)))
})
