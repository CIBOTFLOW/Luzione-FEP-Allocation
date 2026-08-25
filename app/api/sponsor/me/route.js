import { requireSponsor, requireScope } from '../../../../src/portal/auth.js'
import { apiError, json } from '../../../../src/portal/http.js'

export const dynamic = 'force-dynamic'

export function GET(request) {
  try {
    const sponsor = requireSponsor(request)
    requireScope(sponsor, 'sponsor:identity')
    return json(sponsor)
  } catch (error) {
    return apiError(error)
  }
}
