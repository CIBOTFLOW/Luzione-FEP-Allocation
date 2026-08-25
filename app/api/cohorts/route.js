import { requireSponsor, requireScope } from '../../../src/portal/auth.js'
import { apiError, json } from '../../../src/portal/http.js'
import { getCohorts } from '../../../src/portal/mockFepAdapter.js'

export const dynamic = 'force-dynamic'

export function GET(request) {
  try {
    const sponsor = requireSponsor(request)
    requireScope(sponsor, 'cohorts:read')
    const { searchParams } = new URL(request.url)
    return json(getCohorts({ sponsorCode: sponsor.code, programId: searchParams.get('programId') }))
  } catch (error) {
    return apiError(error)
  }
}
