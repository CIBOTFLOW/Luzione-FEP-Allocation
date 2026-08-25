import { apiError, json, normalizeIntentPayload, readPayload } from '../../../src/portal/http.js'
import { createIntent } from '../../../src/portal/mockFepAdapter.js'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const payload = await readPayload(request)
    return json(createIntent({
      sponsorCode: payload.sponsorCode ?? 'LUZIONE',
      payload: normalizeIntentPayload(payload),
    }), { status: 201 })
  } catch (error) {
    return apiError(error)
  }
}
