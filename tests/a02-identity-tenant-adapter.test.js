import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { validateA02IdentityTenant } from '../src/a02IdentityTenantAdapter.js'

const fixturePath = new URL('../fixtures/b07/a02-b03-compatible-allocation.json', import.meta.url)
const pr41FixturePath = new URL('../fixtures/b07/a02-pr41-server-derived-identity-tenant.json', import.meta.url)

function identity() {
  return structuredClone(JSON.parse(readFileSync(fixturePath, 'utf8')).input.command.context)
}

const expectations = {
  actorType: 'service',
  authorityClass: 'INTERNAL_DRAFT',
  capability: 'fep.allocation.simulate',
  purpose: 'synthetic-b07-compatibility',
}

test('Allocation-local adapter consumes the exact server-derived A02 identity and deterministically binds its tenant', () => {
  const first = validateA02IdentityTenant(identity(), expectations)
  const second = validateA02IdentityTenant(identity(), expectations)
  assert.equal(first.identityTenantBindingHash, '10792cf5bae75494f09fb0eddcee7534e76bd0f16b46a8498c3f9abb371e2492')
  assert.equal(second.identityTenantBindingHash, first.identityTenantBindingHash)
  assert.equal(first.tenant.tenantId, 'tenant-b03-synthetic')
  assert.equal(first.tenant.source, 'VERIFIED_CREDENTIAL')
  assert.equal(first.tenant.boundary, 'EXACT')
  assert.equal(first.serverDerived, true)
  assert.equal(first.logicalActor, null)
  assert.equal(first.callerTenantAccepted, false)
  assert.ok(Object.isFrozen(first))
  assert.ok(Object.isFrozen(first.tenant))
})

test('the same local adapter consumes the exact B03-pinned PR41 user identity without granting Allocation authority', () => {
  const fixture = JSON.parse(readFileSync(pr41FixturePath, 'utf8'))
  const binding = validateA02IdentityTenant(fixture.identity, {
    actorType: 'user',
    authorityClass: 'HUMAN_REVIEW_NO_EFFECT',
    capability: 'fep.case.review.nonapproval',
    purpose: 'synthetic-pr41-identity-tenant-rehearsal',
  })
  assert.equal(fixture.sourceFixtureSha256, '0d6a5dc72d93d79c6429ac38c28183c42020e6cccca3e2e144d88c78e0d4b8cb')
  assert.equal(binding.credentialActor.actorType, 'user')
  assert.equal(binding.tenant.tenantId, 'tenant-pr41-alpha')
  assert.equal(binding.logicalActor, null)
  assert.equal(binding.callerTenantAccepted, false)
})

test('strict types, producer identity, tenant authority, delegation, and capability drift fail closed', () => {
  const cases = [
    [(value) => { value.unowned = true }, 'A02_IDENTITY_SCHEMA_MISMATCH'],
    [(value) => { value.serverDerived = 'true' }, 'A02_SERVER_DERIVED_CONTEXT_REQUIRED'],
    [(value) => { value.request.traceId = 'not-hex' }, 'A02_TRACE_CONTEXT_INVALID'],
    [(value) => { value.request.requestedAt = 7 }, 'A02_IDENTITY_VALUE_INVALID'],
    [(value) => { value.credentialActor.actorType = 'user' }, 'A02_PRODUCER_IDENTITY_INVALID'],
    [(value) => { value.credentialActor.credentialSource = 'caller-header' }, 'A02_CREDENTIAL_SOURCE_INVALID'],
    [(value) => { value.logicalActor = { actorId: 'agent-x' } }, 'A02_LOGICAL_ACTOR_FORBIDDEN'],
    [(value) => { value.tenant.source = 'CLIENT_INPUT' }, 'A02_TENANT_AUTHORITY_INVALID'],
    [(value) => { value.tenant.boundary = 'DESCENDANT' }, 'A02_TENANT_AUTHORITY_INVALID'],
    [(value) => { value.authority.authorityClass = 'PRODUCTION' }, 'A02_AUTHORITY_INVALID'],
    [(value) => { value.authority.capability = 'fep.allocation.execute' }, 'A02_AUTHORITY_INVALID'],
    [(value) => { value.sourceVersionRefs.push('caller-context/v1') }, 'A02_SOURCE_VERSION_MISMATCH'],
  ]
  for (const [mutate, code] of cases) {
    const value = identity()
    mutate(value)
    assert.throws(() => validateA02IdentityTenant(value, expectations), (error) => error.code === code)
  }
})
