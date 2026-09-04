import { AllocationError, hash } from './canonical.js'
import { CONTRACT_PINS } from './contractPins.js'

const SOURCE_VERSION_REFS = Object.freeze(['authority-subject/v0.1', 'request-identity/v1'])

function fail(code, message, status = 409) {
  throw new AllocationError(code, message, status)
}

function immutableClone(value) {
  const cloned = structuredClone(value)
  const freeze = (candidate) => {
    if (!candidate || typeof candidate !== 'object' || Object.isFrozen(candidate)) return
    for (const child of Object.values(candidate)) freeze(child)
    Object.freeze(candidate)
  }
  freeze(cloned)
  return cloned
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('A02_IDENTITY_SCHEMA_MISMATCH', `${label} must be an object`)
  }
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('A02_IDENTITY_SCHEMA_MISMATCH', `${label} keys do not match the strict A02 identity boundary`)
  }
}

function assertText(value, label, maximum = 512) {
  if (typeof value !== 'string' || value.trim().length < 2 || value.length > maximum) {
    fail('A02_IDENTITY_VALUE_INVALID', `${label} must be bounded non-empty text`)
  }
}

function assertTimestamp(value, label) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    fail('A02_IDENTITY_VALUE_INVALID', `${label} must be a canonical ISO timestamp`)
  }
}

function sameSet(actual, expected) {
  return Array.isArray(actual)
    && actual.every((value) => typeof value === 'string')
    && new Set(actual).size === actual.length
    && hash([...actual].sort()) === hash([...expected].sort())
}

export function validateA02IdentityTenant(identity, expectations) {
  assertExactKeys(expectations, ['actorType', 'authorityClass', 'capability', 'purpose'], 'identity expectations')
  assertExactKeys(identity, [
    'contractVersion',
    'serverDerived',
    'request',
    'credentialActor',
    'logicalActor',
    'tenant',
    'authority',
    'sourceVersionRefs',
  ], 'identity')
  if (identity.contractVersion !== CONTRACT_PINS.identityContract) {
    fail('A02_IDENTITY_CONTRACT_MISMATCH', 'identity contract version is not pinned', 409)
  }
  if (identity.serverDerived !== true) {
    fail('A02_SERVER_DERIVED_CONTEXT_REQUIRED', 'identity and tenant context must be server derived', 403)
  }

  assertExactKeys(identity.request, ['requestId', 'correlationId', 'traceId', 'spanId', 'requestedAt'], 'identity.request')
  assertText(identity.request.requestId, 'identity.request.requestId')
  assertText(identity.request.correlationId, 'identity.request.correlationId')
  if (!/^[a-f0-9]{32}$/.test(identity.request.traceId) || !/^[a-f0-9]{16}$/.test(identity.request.spanId)) {
    fail('A02_TRACE_CONTEXT_INVALID', 'trace context must use strict lowercase hexadecimal A02 fields')
  }
  assertTimestamp(identity.request.requestedAt, 'identity.request.requestedAt')

  assertExactKeys(identity.credentialActor, ['actorId', 'actorType', 'credentialSource'], 'identity.credentialActor')
  assertText(identity.credentialActor.actorId, 'identity.credentialActor.actorId')
  if (!['agent', 'service', 'user'].includes(identity.credentialActor.actorType)
    || identity.credentialActor.actorType !== expectations.actorType) {
    fail('A02_PRODUCER_IDENTITY_INVALID', 'credential actor type does not match the local compatibility boundary', 403)
  }
  if (!['service-token', 'vercel-oidc'].includes(identity.credentialActor.credentialSource)) {
    fail('A02_CREDENTIAL_SOURCE_INVALID', 'credential source is outside the strict A02 producer boundary', 403)
  }
  if (identity.logicalActor !== null) {
    fail('A02_LOGICAL_ACTOR_FORBIDDEN', 'delegated logical actors cannot mint Allocation or FEP compatibility evidence', 403)
  }

  assertExactKeys(identity.tenant, ['tenantId', 'source', 'boundary'], 'identity.tenant')
  assertText(identity.tenant.tenantId, 'identity.tenant.tenantId')
  if (identity.tenant.source !== 'VERIFIED_CREDENTIAL' || identity.tenant.boundary !== 'EXACT') {
    fail('A02_TENANT_AUTHORITY_INVALID', 'tenant must be exact and derived from a verified credential', 403)
  }

  assertExactKeys(identity.authority, ['authorityClass', 'capability', 'purpose'], 'identity.authority')
  if (identity.authority.authorityClass !== expectations.authorityClass
    || identity.authority.capability !== expectations.capability
    || identity.authority.purpose !== expectations.purpose) {
    fail('A02_AUTHORITY_INVALID', 'identity authority is outside the isolated compatibility purpose', 403)
  }
  if (!sameSet(identity.sourceVersionRefs, SOURCE_VERSION_REFS)) {
    fail('A02_SOURCE_VERSION_MISMATCH', 'identity source versions do not match the exact producer boundary', 409)
  }

  const binding = {
    adapterContract: 'luzione-fep-allocation-a02-identity-tenant-adapter/v0.1-draft',
    producer: `${CONTRACT_PINS.apiRepository}@${CONTRACT_PINS.apiProducerSha}`,
    producerFinalEvidenceSha: CONTRACT_PINS.apiFinalEvidenceSha,
    identityContract: identity.contractVersion,
    serverDerived: true,
    requestId: identity.request.requestId,
    correlationId: identity.request.correlationId,
    credentialActor: identity.credentialActor,
    logicalActor: null,
    tenant: identity.tenant,
    authority: identity.authority,
    sourceVersionRefs: identity.sourceVersionRefs,
    callerTenantAccepted: false,
  }
  return immutableClone({
    ...binding,
    actorIdHash: hash(identity.credentialActor),
    identityTenantBindingHash: hash(binding),
  })
}
