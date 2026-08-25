import test from 'node:test'
import assert from 'node:assert/strict'
import { AllocationService } from '../src/allocationService.js'

function fixture() {
  const service = new AllocationService({ minimumCohortSize: 10 })
  service.createOrganization({ code: 'ACME', name: 'Acme', availableAllocationMinor: 100000 })
  const program = service.createProgram({
    sponsorCode: 'ACME',
    name: 'Work',
    allowedCategories: ['WORK_ENABLEMENT'],
    allowedRegions: ['US-CA-SAN-MATEO'],
  })
  program.status = 'ACTIVE'
  return { service, program }
}

function card(service, overrides = {}) {
  return service.publishCard({
    publicCode: 'CARD-1',
    category: 'WORK_ENABLEMENT',
    headline: 'Required work boots',
    generalizedRegion: 'US-CA-SAN-MATEO',
    approvedCohortTags: ['WORK_STATUS_CONTEXT:JOB_AT_RISK'],
    requestedAmountMinor: 16500,
    currency: 'USD',
    summary: 'Verified work equipment request.',
    consentRef: 'consent-1',
    reviewPolicyVersion: 'v1',
    ...overrides,
  })
}

test('public-safe card can be published', () => {
  const { service } = fixture()
  assert.equal(card(service).status, 'PUBLISHED')
})

test('exact address is rejected', () => {
  const { service } = fixture()
  assert.throws(() => card(service, { exact_address: '1 Main St' }), /prohibited/)
})

test('raw medical evidence is rejected', () => {
  const { service } = fixture()
  assert.throws(() => card(service, { medical_record: { x: 1 } }), /prohibited/)
})

test('consent is required', () => {
  const { service } = fixture()
  assert.throws(() => card(service, { consentRef: '' }), /consent/)
})

test('unapproved cohort dimension is rejected', () => {
  const { service, program } = fixture()
  assert.throws(() => service.approveCohort({
    programId: program.programId,
    name: 'Bad',
    dimensions: ['SOCIAL_MEDIA_SCORE'],
    criteria: { SOCIAL_MEDIA_SCORE: 'high' },
  }), /unapproved/)
})

test('exact diagnosis criterion is rejected', () => {
  const { service, program } = fixture()
  assert.throws(() => service.approveCohort({
    programId: program.programId,
    name: 'Bad',
    dimensions: ['CONDITION_GROUP'],
    criteria: { CONDITION_GROUP: 'support', exact_diagnosis: 'x' },
  }), /prohibited/)
})

test('sponsor can view only compatible public cards', () => {
  const { service, program } = fixture()
  card(service)
  service.publishCard({
    publicCode: 'CARD-2',
    category: 'FOOD',
    headline: 'Food',
    generalizedRegion: 'US-CA-SAN-MATEO',
    approvedCohortTags: [],
    requestedAmountMinor: 1000,
    currency: 'USD',
    summary: 'Food',
    consentRef: 'c',
    reviewPolicyVersion: 'v1',
  })
  assert.equal(service.listCards({ sponsorCode: 'ACME', programId: program.programId }).length, 1)
})

test('allocation intent does not move allocation before FEP acceptance', () => {
  const { service, program } = fixture()
  card(service)
  const intent = service.createAllocationIntent({
    sponsorCode: 'ACME',
    programId: program.programId,
    targetType: 'PUBLIC_CASE_CARD',
    publicCode: 'CARD-1',
    amountMinor: 10000,
    idempotencyKey: 'i1',
    correlationId: 'c',
  })
  assert.equal(intent.status, 'SUBMITTED_FOR_FEP_REVIEW')
  assert.equal(service.organizations.get('ACME').availableAllocationMinor, 100000)
})

test('FEP acceptance updates sponsor allocation', () => {
  const { service, program } = fixture()
  card(service)
  const intent = service.createAllocationIntent({
    sponsorCode: 'ACME',
    programId: program.programId,
    targetType: 'PUBLIC_CASE_CARD',
    publicCode: 'CARD-1',
    amountMinor: 10000,
    idempotencyKey: 'i1',
    correlationId: 'c',
  })
  service.recordFepDisposition(intent.allocationIntentId, { accepted: true, reviewedBy: 'reviewer' })
  assert.equal(service.organizations.get('ACME').availableAllocationMinor, 90000)
})

test('intent replay is idempotent', () => {
  const { service, program } = fixture()
  card(service)
  const input = {
    sponsorCode: 'ACME',
    programId: program.programId,
    targetType: 'PUBLIC_CASE_CARD',
    publicCode: 'CARD-1',
    amountMinor: 10000,
    idempotencyKey: 'i1',
    correlationId: 'c',
  }
  assert.equal(service.createAllocationIntent(input).allocationIntentId, service.createAllocationIntent(input).allocationIntentId)
})

test('idempotency conflict is rejected', () => {
  const { service, program } = fixture()
  card(service)
  service.createAllocationIntent({
    sponsorCode: 'ACME',
    programId: program.programId,
    targetType: 'PUBLIC_CASE_CARD',
    publicCode: 'CARD-1',
    amountMinor: 10000,
    idempotencyKey: 'i1',
    correlationId: 'c',
  })
  assert.throws(() => service.createAllocationIntent({
    sponsorCode: 'ACME',
    programId: program.programId,
    targetType: 'PUBLIC_CASE_CARD',
    publicCode: 'CARD-1',
    amountMinor: 12000,
    idempotencyKey: 'i1',
    correlationId: 'c',
  }), /idempotency/)
})

test('insufficient sponsor allocation is rejected', () => {
  const { service, program } = fixture()
  card(service)
  assert.throws(() => service.createAllocationIntent({
    sponsorCode: 'ACME',
    programId: program.programId,
    targetType: 'PUBLIC_CASE_CARD',
    publicCode: 'CARD-1',
    amountMinor: 200000,
    idempotencyKey: 'i1',
    correlationId: 'c',
  }), /insufficient/)
})

test('small cohort report is suppressed', () => {
  const { service, program } = fixture()
  assert.equal(service.report({ sponsorCode: 'ACME', programId: program.programId, cohortCount: 4, metrics: { funded: 4 } }).suppressed, true)
})

test('large enough cohort report is returned', () => {
  const { service, program } = fixture()
  assert.equal(service.report({ sponsorCode: 'ACME', programId: program.programId, cohortCount: 12, metrics: { funded: 12 } }).suppressed, false)
})
