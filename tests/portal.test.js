import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  EFFECT_POSTURE,
  FORBIDDEN_CAPABILITIES,
  PROHIBITED_SPONSOR_FIELDS,
  PUBLIC_SAFE_FIELDS,
  READ_SCOPES,
  WRITE_SCOPES,
  assertPublicSafePayload,
} from '../src/portal/contracts.js'
import {
  createIntent,
  getAllocation,
  getAudit,
  getCohorts,
  getOpportunities,
  getPrograms,
  getReports,
  workProgram,
} from '../src/portal/mockFepAdapter.js'
import { GET as health } from '../app/health/route.js'
import { GET as apiMe } from '../app/api/sponsor/me/route.js'
import { GET as apiPrograms } from '../app/api/programs/route.js'
import { POST as apiCreateIntent } from '../app/api/allocation-intents/route.js'

const request = (url, init = {}) => new Request(url, init)
const body = async (response) => response.json()

test('public-safe contracts pin DTOs, scopes, and forbidden capabilities', () => {
  assert.equal(EFFECT_POSTURE, 'NO_EFFECT')
  assert(PUBLIC_SAFE_FIELDS.includes('public-safe case card'))
  assert(PROHIBITED_SPONSOR_FIELDS.includes('medical records'))
  assert(READ_SCOPES.includes('opportunities:read'))
  assert(WRITE_SCOPES.includes('allocation_intents:create'))
  assert(FORBIDDEN_CAPABILITIES.includes('fund transfer'))
})

test('contract scanner rejects private payload keys', () => {
  assert.throws(() => assertPublicSafePayload({ exact_address: 'hidden' }), /prohibited/)
})

test('sponsor cannot access another sponsor program allocation', () => {
  const northstarProgram = getPrograms({ sponsorCode: 'NORTHSTAR' })[0]
  assert.throws(() => getAllocation({
    sponsorCode: 'LUZIONE',
    programId: northstarProgram.programId,
  }), /not visible/)
})

test('sponsor cannot submit against unauthorized program', () => {
  const northstarProgram = getPrograms({ sponsorCode: 'NORTHSTAR' })[0]
  assert.throws(() => createIntent({
    sponsorCode: 'LUZIONE',
    payload: {
      programId: northstarProgram.programId,
      targetType: 'PUBLIC_CASE_CARD',
      publicCode: 'BRV-WORK-001',
      amountMinor: 1000,
      idempotencyKey: 'cross-sponsor',
      correlationId: 'test',
    },
  }), /not visible/)
})

test('public API payloads do not expose prohibited sponsor fields', () => {
  const payload = {
    programs: getPrograms({ sponsorCode: 'LUZIONE' }),
    cohorts: getCohorts({ sponsorCode: 'LUZIONE' }),
    opportunities: getOpportunities({ sponsorCode: 'LUZIONE', programId: workProgram.programId }),
    reports: getReports({ sponsorCode: 'LUZIONE' }),
    audit: getAudit({ sponsorCode: 'LUZIONE' }),
  }
  assert.doesNotThrow(() => assertPublicSafePayload(payload))
})

test('health compatibility endpoint reports non-authoritative no-effect posture', async () => {
  const response = await health()
  const payload = await body(response)
  assert.equal(response.status, 200)
  assert.equal(payload.service, 'luzione-fep-allocation')
  assert.equal(payload.authoritative, false)
  assert.equal(payload.effectPosture, 'NO_EFFECT')
})

test('sponsor API facade returns scoped sponsor identity', async () => {
  const response = await apiMe(request('https://fep.luzione.com/api/sponsor/me', {
    headers: { 'x-sponsor-code': 'LUZIONE' },
  }))
  const payload = await body(response)
  assert.equal(response.status, 200)
  assert.equal(payload.code, 'LUZIONE')
  assert(payload.scopes.includes('allocation_intents:create'))
})

test('program API facade enforces sponsor header isolation', async () => {
  const response = await apiPrograms(request('https://fep.luzione.com/api/programs', {
    headers: { 'x-sponsor-code': 'NORTHSTAR' },
  }))
  const payload = await body(response)
  assert.equal(response.status, 200)
  assert.equal(payload.length, 1)
  assert.equal(payload[0].sponsorCode, 'NORTHSTAR')
})

test('allocation intent API creates submitted intent without accepting funds', async () => {
  const response = await apiCreateIntent(request('https://fep.luzione.com/api/allocation-intents', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-sponsor-code': 'LUZIONE',
    },
    body: JSON.stringify({
      programId: workProgram.programId,
      targetType: 'PUBLIC_CASE_CARD',
      publicCode: 'BRV-WORK-001',
      amountMinor: 1000,
      idempotencyKey: 'api-intent-test',
      correlationId: 'api-test',
    }),
  }))
  const payload = await body(response)
  assert.equal(response.status, 201)
  assert.equal(payload.status, 'SUBMITTED_FOR_FEP_REVIEW')
})

test('planned UI routes and controls exist', async () => {
  const files = await Promise.all([
    readFile(new URL('../app/dashboard/page.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/programs/page.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/programs/[programId]/page.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/opportunities/page.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/cohorts/page.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/intents/new/page.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/intents/[intentId]/page.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/reports/page.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/audit/page.js', import.meta.url), 'utf8'),
  ])
  const joined = files.join('\n')
  assert.match(joined, /Create Allocation Intent/)
  assert.match(joined, /Download JSON Export/)
  assert.match(joined, /Public-Safe Opportunities/)
  assert.match(joined, /Reviewed Cohorts/)
})
