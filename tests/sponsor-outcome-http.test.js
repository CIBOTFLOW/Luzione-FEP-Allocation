import test from 'node:test'
import assert from 'node:assert/strict'

import { createDemoAllocationService } from '../src/bootstrap.js'
import { createAllocationHttpServer } from '../src/server.js'

async function withServer(run) {
  const demo = createDemoAllocationService()
  const server = createAllocationHttpServer({
    service: demo.service,
    defaults: { programId: demo.programId, cohortId: demo.cohortId },
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const baseUrl = `http://127.0.0.1:${address.port}`
  try {
    return await run({ baseUrl, demo })
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

async function json(response) {
  return { response, body: await response.json() }
}

test('demo bootstrap exposes one active campaign and one confirmed public proof event', () => {
  const demo = createDemoAllocationService()
  const campaigns = demo.service.listCampaigns({ actor: demo.actor, sponsorCode: 'LUZIONE' })
  const proofFeed = demo.service.listProofFeed({ actor: demo.actor, sponsorCode: 'LUZIONE' })

  assert.equal(campaigns.length, 1)
  assert.equal(campaigns[0].status, 'ACTIVE')
  assert.equal(campaigns[0].effectMode, 'DISABLED')
  assert.equal(campaigns[0].committedMinor, 16500)
  assert.equal(proofFeed.length, 1)
  assert.equal(proofFeed[0].lifecycleState, 'OUTCOME_CONFIRMED')
  assert.equal(proofFeed[0].sponsor.displayName, 'Luzione')
})

test('HTTP surface serves the Luzione studio and public-safe sponsor projections', async () => {
  await withServer(async ({ baseUrl }) => {
    const home = await fetch(baseUrl + '/')
    assert.equal(home.status, 200)
    assert.match(await home.text(), /Luzione Sponsor Outcome Studio/)
    assert.equal(home.headers.get('x-frame-options'), 'DENY')
    assert.match(home.headers.get('content-security-policy'), /frame-ancestors 'none'/)

    const health = await json(await fetch(baseUrl + '/health'))
    assert.equal(health.response.status, 200)
    assert.equal(health.body.version, '0.7.0-draft')
    assert.equal(health.body.authoritative, false)
    assert.equal(health.body.moneyMovement, false)

    const [campaigns, outcomes, proofs, settings] = await Promise.all([
      fetch(baseUrl + '/v1/campaigns').then(json),
      fetch(baseUrl + '/v1/sponsored-outcomes').then(json),
      fetch(baseUrl + '/v1/proof-feed').then(json),
      fetch(baseUrl + '/v1/settings').then(json),
    ])
    assert.equal(campaigns.response.status, 200)
    assert.equal(campaigns.body[0].fundingRail, 'SPONSORED_DIRECT_GIFT')
    assert.equal(outcomes.body[0].publicCaseCode, 'LZN-WORK-001')
    assert.equal(outcomes.body[0].effectMode, 'DISABLED')
    assert.equal(proofs.body[0].lifecycleState, 'OUTCOME_CONFIRMED')
    assert.deepEqual(settings.body.allocationTargets, ['PROGRAM', 'COHORT'])
    assert.equal(settings.body.namedRecipientSelection, false)
    assert.equal(settings.body.valueBoundary.recognition.transferable, false)
    assert.equal(settings.body.valueBoundary.essentialsCredits.cashOut, false)
  })
})

test('HTTP mutations create review-only brand and campaign records without enabling effects', async () => {
  await withServer(async ({ baseUrl }) => {
    const brands = await (await fetch(baseUrl + '/v1/brand-versions')).json()
    const approvedBrand = brands.find((brand) => brand.status === 'APPROVED')

    const newBrand = await json(await fetch(baseUrl + '/v1/brand-versions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Luzione Community',
        tagline: 'Practical help, verified through completion.',
        logoAsset: {
          assetId: 'asset_luzione_community_test',
          fileName: 'luzione-community.png',
          mimeType: 'image/png',
          byteSize: 2048,
          sha256: 'a'.repeat(64),
          altText: 'Luzione Community wordmark',
        },
      }),
    }))
    assert.equal(newBrand.response.status, 201)
    assert.equal(newBrand.body.status, 'PENDING_REVIEW')

    const campaign = await json(await fetch(baseUrl + '/v1/campaigns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        brandVersionId: approvedBrand.brandVersionId,
        fundingRail: 'SPONSORED_DIRECT_GIFT',
        name: 'Luzione Essential Tools Pilot',
        publicSummary: 'A bounded review-only pilot for verified work-enablement outcomes.',
        budgetMinor: 100000,
        perOutcomeCapMinor: 20000,
        currency: 'USD',
        allowedCategories: ['WORK_ENABLEMENT'],
        allowedRegions: ['US-CA-SAN-MATEO'],
        startsAt: '2026-09-01T00:00:00.000Z',
        endsAt: '2026-12-31T23:59:59.000Z',
        attributionMode: 'SPONSOR_NAME_ONLY',
        acknowledgements: {
          nonCharitableAcknowledged: true,
          noRecipientContact: true,
          noPublicityCondition: true,
          noCashOutOrExchange: true,
        },
      }),
    }))
    assert.equal(campaign.response.status, 201)
    assert.equal(campaign.body.status, 'DRAFT')
    assert.equal(campaign.body.effectMode, 'DISABLED')

    const submitted = await json(await fetch(`${baseUrl}/v1/campaigns/${campaign.body.campaignId}/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }))
    assert.equal(submitted.response.status, 200)
    assert.equal(submitted.body.status, 'SUBMITTED_FOR_FEP_REVIEW')
  })
})

test('HTTP direct-outcome request replays safely and rejects financial-value campaign promises', async () => {
  await withServer(async ({ baseUrl }) => {
    const campaigns = await (await fetch(baseUrl + '/v1/campaigns')).json()
    const campaign = campaigns.find((candidate) => candidate.name === 'The First 25 Useful Outcomes')

    const outcomeRequest = {
      campaignId: campaign.campaignId,
      publicCaseCode: 'LZN-WORK-002',
      amountMinor: 8400,
      rationale: 'Complete this bounded verified outcome.',
      correlationId: 'http-direct-outcome-2',
      idempotencyKey: 'http-direct-outcome-2',
      acknowledgements: {
        nonCharitableAcknowledged: true,
        noRecipientContact: true,
        noPublicityCondition: true,
        noCashOutOrExchange: true,
      },
    }
    const created = await json(await fetch(baseUrl + '/v1/sponsored-outcomes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(outcomeRequest),
    }))
    assert.equal(created.response.status, 201)
    assert.equal(created.body.status, 'SUBMITTED_FOR_FEP_REVIEW')
    assert.equal(created.body.publicCaseCode, 'LZN-WORK-002')
    assert.equal(created.body.effectMode, 'DISABLED')

    const replay = await json(await fetch(baseUrl + '/v1/sponsored-outcomes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(outcomeRequest),
    }))
    assert.equal(replay.response.status, 201)
    assert.equal(replay.body.idempotentReplay, true)
    assert.equal(replay.body.effectMode, 'DISABLED')

    const brands = await (await fetch(baseUrl + '/v1/brand-versions')).json()
    const approvedBrand = brands.find((brand) => brand.status === 'APPROVED')
    const unsafe = await json(await fetch(baseUrl + '/v1/campaigns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        brandVersionId: approvedBrand.brandVersionId,
        fundingRail: 'SPONSORED_DIRECT_GIFT',
        name: 'Future token rewards',
        publicSummary: 'Fund outcomes now and receive crypto later.',
        budgetMinor: 100000,
        perOutcomeCapMinor: 20000,
        currency: 'USD',
        allowedCategories: ['WORK_ENABLEMENT'],
        allowedRegions: [],
        startsAt: '2026-09-01T00:00:00.000Z',
        endsAt: '2026-12-31T23:59:59.000Z',
        attributionMode: 'SPONSOR_NAME_ONLY',
        acknowledgements: {
          nonCharitableAcknowledged: true,
          noRecipientContact: true,
          noPublicityCondition: true,
          noCashOutOrExchange: true,
        },
      }),
    }))
    assert.equal(unsafe.response.status, 422)
    assert.equal(unsafe.body.error, 'FINANCIAL_PROMISE_PROHIBITED')
  })
})
