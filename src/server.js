import { readFile } from 'node:fs/promises'
import http from 'node:http'
import { pathToFileURL } from 'node:url'
import { URL } from 'node:url'

import { AllocationError } from './canonical.js'
import { createDemoAllocationService } from './bootstrap.js'
import { LUZIONE_VALUE_BOUNDARY } from './luzioneValueBoundary.js'

const ASSETS = new Map([
  ['/', { file: '../public/index.html', type: 'text/html; charset=utf-8' }],
  ['/app.js', { file: '../public/app.js', type: 'text/javascript; charset=utf-8' }],
  ['/styles.css', { file: '../public/styles.css', type: 'text/css; charset=utf-8' }],
  ['/b07-g0-evidence.json', { file: '../public/b07-g0-evidence.json', type: 'application/json; charset=utf-8' }],
])

function securityHeaders(contentType, cacheControl = 'no-store') {
  return {
    'content-type': contentType,
    'cache-control': cacheControl,
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  }
}

async function readJson(request, maximumBytes = 16384) {
  if (!String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
    throw new AllocationError('JSON_REQUIRED', 'content-type must be application/json', 415)
  }
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > maximumBytes) throw new AllocationError('BODY_TOO_LARGE', 'request body is too large', 413)
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new AllocationError('INVALID_JSON', 'request body is not valid JSON', 400)
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, securityHeaders('application/json; charset=utf-8'))
  response.end(JSON.stringify(body, null, 2))
}

async function sendAsset(response, asset) {
  try {
    const content = await readFile(new URL(asset.file, import.meta.url))
    response.writeHead(200, securityHeaders(asset.type, 'public, max-age=300'))
    response.end(content)
  } catch {
    sendJson(response, 404, { error: 'ASSET_NOT_FOUND' })
  }
}

function productionTokenMap() {
  const raw = process.env.ALLOC_PORTAL_TOKENS_JSON?.trim()
  if (!raw) return {}
  try {
    const value = JSON.parse(raw)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    throw new AllocationError('AUTH_CONFIGURATION_INVALID', 'portal token configuration is invalid', 503)
  }
}

function resolveActor(request, service) {
  const authorization = String(request.headers.authorization ?? '')
  if (authorization.startsWith('Bearer ')) {
    const token = authorization.slice('Bearer '.length).trim()
    const session = productionTokenMap()[token]
    if (session?.sponsorCode && session?.subjectId) {
      return service.actor(session.sponsorCode, session.subjectId)
    }
  }
  if (process.env.NODE_ENV !== 'production') {
    return service.actor('LUZIONE', 'demo-luzione-planner')
  }
  throw new AllocationError('AUTHENTICATION_REQUIRED', 'an authenticated portal session is required', 401)
}

function routeContext(url, actor, defaults) {
  return {
    actor,
    sponsorCode: url.searchParams.get('sponsorCode') ?? actor.sponsorCode,
    programId: url.searchParams.get('programId') ?? defaults.programId,
  }
}

export function createAllocationHttpServer({ service, defaults }) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://' + (request.headers.host ?? 'localhost'))
      const asset = ASSETS.get(url.pathname)
      if (request.method === 'GET' && asset) return await sendAsset(response, asset)

      if (request.method === 'GET' && url.pathname === '/health') {
        return sendJson(response, 200, {
          status: 'ok',
          service: 'luzione-fep-allocation',
          version: '0.7.0-draft',
          authoritative: false,
          authoritySource: 'FEP_PLATFORM_PROJECTION',
          namedRecipientSelection: false,
          moneyMovement: false,
        })
      }

      const actor = resolveActor(request, service)
      const context = routeContext(url, actor, defaults)

      if (request.method === 'GET' && url.pathname === '/v1/overview') {
        return sendJson(response, 200, service.getOverview(context))
      }
      if (request.method === 'GET' && url.pathname === '/v1/programs') {
        return sendJson(response, 200, service.listPrograms(context))
      }
      if (request.method === 'GET' && url.pathname === '/v1/cohorts') {
        return sendJson(response, 200, service.listCohorts(context))
      }
      if (request.method === 'GET' && url.pathname === '/v1/opportunities') {
        return sendJson(response, 200, service.listCards({
          ...context,
          cohortId: url.searchParams.get('cohortId'),
        }))
      }
      if (request.method === 'GET' && url.pathname === '/v1/allocation-intents') {
        return sendJson(response, 200, service.listIntents(context))
      }
      if (request.method === 'POST' && url.pathname === '/v1/allocation-intents') {
        const input = await readJson(request)
        return sendJson(response, 201, service.createAllocationIntent({
          ...input,
          actor,
          sponsorCode: actor.sponsorCode,
        }))
      }
      if (request.method === 'GET' && url.pathname === '/v1/brand-versions') {
        return sendJson(response, 200, service.listBrandVersions(context))
      }
      if (request.method === 'POST' && url.pathname === '/v1/brand-versions') {
        const input = await readJson(request)
        return sendJson(response, 201, service.registerBrandVersion({ ...input, actor, sponsorCode: actor.sponsorCode }))
      }
      if (request.method === 'GET' && url.pathname === '/v1/campaigns') {
        return sendJson(response, 200, service.listCampaigns(context))
      }
      if (request.method === 'POST' && url.pathname === '/v1/campaigns') {
        const input = await readJson(request)
        return sendJson(response, 201, service.createCampaign({ ...input, actor, sponsorCode: actor.sponsorCode }))
      }
      if (request.method === 'POST' && /^\/v1\/campaigns\/[^/]+\/submit$/.test(url.pathname)) {
        const campaignId = decodeURIComponent(url.pathname.split('/')[3])
        return sendJson(response, 200, service.submitCampaign(actor, campaignId))
      }
      if (request.method === 'GET' && url.pathname === '/v1/sponsored-outcomes') {
        return sendJson(response, 200, service.listSponsoredOutcomeRequests(context))
      }
      if (request.method === 'POST' && url.pathname === '/v1/sponsored-outcomes') {
        const input = await readJson(request)
        return sendJson(response, 201, service.createSponsoredOutcomeRequest({ ...input, actor, sponsorCode: actor.sponsorCode }))
      }
      if (request.method === 'GET' && url.pathname === '/v1/proof-feed') {
        return sendJson(response, 200, service.listProofFeed(context))
      }
      if (request.method === 'GET' && url.pathname === '/v1/impact') {
        return sendJson(response, 200, service.getImpact(context))
      }
      if (request.method === 'GET' && url.pathname === '/v1/audit') {
        return sendJson(response, 200, service.listAudit({
          actor,
          sponsorCode: context.sponsorCode,
          limit: url.searchParams.get('limit'),
        }))
      }
      if (request.method === 'GET' && url.pathname === '/v1/settings') {
        return sendJson(response, 200, {
          sponsorCode: actor.sponsorCode,
          subjectId: actor.subjectId,
          authoritySource: 'FEP_PLATFORM_PROJECTION',
          minimumCohortSize: service.minimumCohortSize,
          allocationTargets: ['PROGRAM', 'COHORT'],
          specificOutcomeRail: 'PUBLIC_CASE_CODE_REQUIRES_FEP_REVIEW',
          namedRecipientSelection: false,
          rawEvidenceAccess: false,
          directMoneyMovement: false,
          fundingRails: ['MERCHANT_FUNDED_OUTCOME', 'SPONSORED_DIRECT_GIFT', 'GOVERNED_PROGRAM_SUPPORT'],
          valueBoundary: LUZIONE_VALUE_BOUNDARY,
          productionAuthenticationConfigured: Boolean(process.env.ALLOC_PORTAL_TOKENS_JSON?.trim()),
        })
      }
      return sendJson(response, 404, { error: 'NOT_FOUND', message: 'route not found' })
    } catch (error) {
      return sendJson(response, error instanceof AllocationError ? error.status : 500, {
        error: error.code ?? 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'unexpected error',
      })
    }
  })
}

export function startServer() {
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOC_PORTAL_TOKENS_JSON?.trim()) {
    throw new Error('ALLOC_PORTAL_TOKENS_JSON is required in production')
  }
  const demo = createDemoAllocationService()
  const server = createAllocationHttpServer({
    service: demo.service,
    defaults: { programId: demo.programId, cohortId: demo.cohortId },
  })
  const port = Number(process.env.PORT ?? 8091)
  server.listen(port, () => console.log('allocation control center listening on ' + port))
  return server
}

const mainModule = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
if (mainModule) startServer()
