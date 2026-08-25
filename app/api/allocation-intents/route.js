import { requireSponsor, requireScope } from '../../../src/portal/auth.js'
import { apiError, json, normalizeIntentPayload, readPayload } from '../../../src/portal/http.js'
import { createIntent, getIntents } from '../../../src/portal/mockFepAdapter.js'

export const dynamic = 'force-dynamic'

export function GET(request) {
  try {
    const sponsor = requireSponsor(request)
    requireScope(sponsor, 'intents:read')
    return json(getIntents({ sponsorCode: sponsor.code }))
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request) {
  try {
    const sponsor = requireSponsor(request)
    requireScope(sponsor, 'allocation_intents:create')
    const payload = normalizeIntentPayload(await readPayload(request))
    return json(createIntent({ sponsorCode: sponsor.code, payload }), { status: 201 })
  } catch (error) {
    return apiError(error)
  }
}
