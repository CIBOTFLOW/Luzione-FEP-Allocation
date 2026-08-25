import { json } from '../../src/portal/http.js'
import { allocationPosture } from '../../src/portal/contracts.js'

export const dynamic = 'force-dynamic'

export function GET() {
  return json({
    status: 'ok',
    service: 'luzione-fep-allocation',
    authoritative: false,
    ...allocationPosture(),
  })
}
