import { requireSponsor, requireScope } from '../../../../src/portal/auth.js'
import { apiError, json } from '../../../../src/portal/http.js'
import { getIntent } from '../../../../src/portal/mockFepAdapter.js'

export const dynamic = 'force-dynamic'

export async function GET(request, { params }) {
  try {
    const sponsor = requireSponsor(request)
    requireScope(sponsor, 'intents:read')
    const { intentId } = await params
    return json(getIntent({ sponsorCode: sponsor.code, intentId }))
  } catch (error) {
    return apiError(error)
  }
}
