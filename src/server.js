import http from 'node:http'
import { URL } from 'node:url'
import { AllocationService } from './allocationService.js'
import { AllocationError } from './canonical.js'

const service = new AllocationService()
service.createOrganization({ code: 'LUZIONE', name: 'Luzione', availableAllocationMinor: 2500000 })
const program = service.createProgram({
  sponsorCode: 'LUZIONE',
  name: 'Work Enablement',
  allowedCategories: ['WORK_ENABLEMENT'],
  allowedRegions: ['US-CA-SAN-MATEO'],
})
program.status = 'ACTIVE'
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

const port = Number(process.env.PORT ?? 8091)
const read = async (request) => {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}
}
const send = (response, status, body) => {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  response.end(JSON.stringify(body, null, 2))
}

http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
    if (request.method === 'GET' && url.pathname === '/health') {
      return send(response, 200, { status: 'ok', service: 'luzione-fep-allocation', authoritative: false })
    }
    if (request.method === 'GET' && url.pathname === '/v1/opportunities') {
      return send(response, 200, service.listCards({
        sponsorCode: url.searchParams.get('sponsorCode') ?? 'LUZIONE',
        programId: url.searchParams.get('programId') ?? program.programId,
      }))
    }
    if (request.method === 'POST' && url.pathname === '/v1/allocation-intents') {
      return send(response, 201, service.createAllocationIntent(await read(request)))
    }
    return send(response, 404, { error: 'not found' })
  } catch (error) {
    return send(response, error instanceof AllocationError ? error.status : 500, {
      error: error.code ?? 'INTERNAL_ERROR',
      message: error.message,
    })
  }
}).listen(port, () => console.log(`allocation portal reference on ${port}`))
