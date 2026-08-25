import { AllocationError } from '../canonical.js'
import { getSponsorMe } from './mockFepAdapter.js'

export function sponsorCodeFromRequest(request) {
  return request.headers.get('x-sponsor-code') ?? process.env.DEFAULT_SPONSOR_CODE ?? 'LUZIONE'
}

export function requireSponsor(request) {
  const sponsorCode = sponsorCodeFromRequest(request)
  return getSponsorMe(sponsorCode)
}

export function requireScope(sponsor, scope) {
  if (!sponsor.scopes.includes(scope)) {
    throw new AllocationError('SPONSOR_SCOPE_DENIED', `missing sponsor scope: ${scope}`, 403)
  }
}

export function defaultSponsorCode() {
  return process.env.DEFAULT_SPONSOR_CODE ?? 'LUZIONE'
}
