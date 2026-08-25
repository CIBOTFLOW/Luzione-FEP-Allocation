import { requireSponsor, requireScope } from '../../../src/portal/auth.js'
import { apiError, json } from '../../../src/portal/http.js'
import { getReport, getReports } from '../../../src/portal/mockFepAdapter.js'

export const dynamic = 'force-dynamic'

export function GET(request) {
  try {
    const sponsor = requireSponsor(request)
    requireScope(sponsor, 'reports:aggregate:read')
    const { searchParams } = new URL(request.url)
    const programId = searchParams.get('programId')
    return json(programId ? getReport({ sponsorCode: sponsor.code, programId }) : getReports({ sponsorCode: sponsor.code }))
  } catch (error) {
    return apiError(error)
  }
}
