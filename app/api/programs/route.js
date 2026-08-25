import { requireSponsor, requireScope } from '../../../src/portal/auth.js'
import { apiError, json } from '../../../src/portal/http.js'
import { getPrograms } from '../../../src/portal/mockFepAdapter.js'

export const dynamic = 'force-dynamic'

export function GET(request) {
  try {
    const sponsor = requireSponsor(request)
    requireScope(sponsor, 'programs:read')
    return json(getPrograms({ sponsorCode: sponsor.code }))
  } catch (error) {
    return apiError(error)
  }
}
