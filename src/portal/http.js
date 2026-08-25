import { AllocationError } from '../canonical.js'

export const noStoreHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
}

export function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      ...noStoreHeaders,
      ...(init.headers ?? {}),
    },
  })
}

export function apiError(error) {
  const status = error instanceof AllocationError || error.status ? error.status : 500
  return json({
    error: error.code ?? 'INTERNAL_ERROR',
    message: error.message,
  }, { status })
}

export async function readPayload(request) {
  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) return request.json()
  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    return Object.fromEntries(form.entries())
  }
  return {}
}

export function normalizeIntentPayload(input) {
  return {
    programId: String(input.programId ?? ''),
    targetType: String(input.targetType ?? 'PUBLIC_CASE_CARD'),
    publicCode: input.publicCode ? String(input.publicCode) : undefined,
    cohortId: input.cohortId ? String(input.cohortId) : undefined,
    amountMinor: Number(input.amountMinor ?? 0),
    rationale: input.rationale ? String(input.rationale) : null,
    idempotencyKey: input.idempotencyKey ? String(input.idempotencyKey) : undefined,
    correlationId: input.correlationId ? String(input.correlationId) : undefined,
  }
}
