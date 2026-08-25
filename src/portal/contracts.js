export const EFFECT_POSTURE = 'NO_EFFECT'
export const MINIMUM_COHORT_SIZE = 10

export const PUBLIC_SAFE_FIELDS = Object.freeze([
  'sponsor organization',
  'program',
  'reviewed cohort',
  'public-safe case card',
  'allocation intent',
  'FEP disposition',
  'aggregate impact report',
  'sponsor audit event',
])

export const PROHIBITED_SPONSOR_FIELDS = Object.freeze([
  'raw application answers',
  'exact identity',
  'contact details',
  'exact address',
  'medical records',
  'exact diagnosis',
  'private fraud notes',
  'private review notes',
  'reward balance',
  'purchase history',
  'publicity willingness',
  'gratitude willingness',
])

export const READ_SCOPES = Object.freeze([
  'sponsor:identity',
  'programs:read',
  'allocation:read',
  'cohorts:read',
  'opportunities:read',
  'intents:read',
  'reports:aggregate:read',
  'audit:read',
])

export const WRITE_SCOPES = Object.freeze([
  'allocation_intents:create',
  'sponsor_metadata:create',
])

export const FORBIDDEN_CAPABILITIES = Object.freeze([
  'case approval',
  'case denial',
  'recipient contact',
  'fund transfer',
  'raw evidence access',
  'browser service credentials',
])

export function assertPublicSafePayload(payload) {
  const serialized = JSON.stringify(payload).toLowerCase()
  const hits = [
    'full_name',
    'exact_name',
    'email',
    'phone',
    'exact_address',
    'street_address',
    'postal_code',
    'medical_record',
    'raw_evidence',
    'exact_diagnosis',
    'social_security_number',
    'reward_balance',
    'purchase_history',
    'publicity_willingness',
    'gratitude_willingness',
  ].filter((key) => serialized.includes(key))

  if (hits.length) {
    const error = new Error(`payload contains prohibited sponsor fields: ${hits.join(', ')}`)
    error.code = 'PRIVATE_FIELD_PROHIBITED'
    error.status = 422
    throw error
  }
}

export function allocationPosture() {
  return {
    effectPosture: EFFECT_POSTURE,
    liveAllocationBlocked: true,
    blocker: 'legal, accounting, privacy, access-policy, and live FEP authorization',
    fepAuthoritative: true,
  }
}
