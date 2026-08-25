import { requireSponsor, requireScope } from '../../../src/portal/auth.js'
import { apiError, json } from '../../../src/portal/http.js'
import { getOpportunities, getPrograms } from '../../../src/portal/mockFepAdapter.js'

export const dynamic = 'force-dynamic'

export function GET(request) {
  try {
    const sponsor = requireSponsor(request)
    requireScope(sponsor, 'opportunities:read')
    const { searchParams } = new URL(request.url)
    const programId = searchParams.get('programId') ?? getPrograms({ sponsorCode: sponsor.code })[0]?.programId
    return json(getOpportunities({
      sponsorCode: sponsor.code,
      programId,
      cohortId: searchParams.get('cohortId'),
    }))
  } catch (error) {
    return apiError(error)
  }
}
