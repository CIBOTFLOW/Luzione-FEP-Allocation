import { requireSponsor, requireScope } from '../../../src/portal/auth.js'
import { apiError, json } from '../../../src/portal/http.js'
import { exportAudit, getAudit } from '../../../src/portal/mockFepAdapter.js'

export const dynamic = 'force-dynamic'

export function GET(request) {
  try {
    const sponsor = requireSponsor(request)
    requireScope(sponsor, 'audit:read')
    const { searchParams } = new URL(request.url)
    return json(searchParams.get('export') ? exportAudit({ sponsorCode: sponsor.code }) : getAudit({ sponsorCode: sponsor.code }))
  } catch (error) {
    return apiError(error)
  }
}
