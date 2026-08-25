import { apiError, json } from '../../../src/portal/http.js'
import { getOpportunities, getPrograms } from '../../../src/portal/mockFepAdapter.js'

export const dynamic = 'force-dynamic'

export function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const sponsorCode = searchParams.get('sponsorCode') ?? 'LUZIONE'
    const programId = searchParams.get('programId') ?? getPrograms({ sponsorCode })[0]?.programId
    return json(getOpportunities({ sponsorCode, programId }))
  } catch (error) {
    return apiError(error)
  }
}
