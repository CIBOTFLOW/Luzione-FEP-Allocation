function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

export const LUZIONE_VALUE_BOUNDARY = deepFreeze({
  contractVersion: 'luzione-closed-loop-value-boundary/v0.1-draft',
  recognition: {
    publicName: 'Luzione Impact Points',
    purpose: 'verified participation history and recognition',
    monetaryValue: false,
    transferable: false,
    redeemable: false,
    eligibilityInfluence: false,
    futureConversionEntitlement: false,
  },
  essentialsCredits: {
    publicName: 'Luzione Essentials Credits',
    purpose: 'closed-loop access to approved essential goods and services',
    issueOnlyAgainst: 'CLEARED_SPONSOR_FUNDS_OR_COMMITTED_FULFILLMENT_CAPACITY',
    fixedRedemptionAccounting: true,
    transferable: false,
    peerToPeerTransfer: false,
    cashOut: false,
    exchangeListing: false,
    appreciationClaim: false,
    reversalsAndRefundsRequired: true,
  },
  settlement: {
    recipientSpendsOnlyInsideApprovedNetwork: true,
    merchantSettlement: 'FIAT_OR_REGULATED_PROVIDER',
    reserveMayFundOperations: false,
  },
})
