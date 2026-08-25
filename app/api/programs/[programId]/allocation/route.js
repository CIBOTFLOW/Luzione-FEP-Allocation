import { requireSponsor, requireScope } from '../../../../../src/portal/auth.js'
import { apiError, json } from '../../../../../src/portal/http.js'
import { getAllocation } from '../../../../../src/portal/mockFepAdapter.js'

export const dynamic = 'force-dynamic'

export async function GET(request, { params }) {
  try {
    const sponsor = requireSponsor(request)
    requireScope(sponsor, 'allocation:read')
    const { programId } = await params
    return json(getAllocation({ sponsorCode: sponsor.code, programId }))
  } catch (error) {
    return apiError(error)
  }
}
