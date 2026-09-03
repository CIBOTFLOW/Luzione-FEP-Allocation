# FEP readback contracts

## Posture

The allocation portal is a non-authoritative projection consumer. It may hold a local sponsor intent to prevent duplicate or aggregate overcommitment, but it cannot make an FEP decision or treat local state as money.

## Contracts

| Contract | Resource | Purpose | Portal effect |
| --- | --- | --- | --- |
| `fep-allocation-balance-v1` | `SPONSOR_ALLOCATION` | settled/committed FEP allocation projection | updates read-only available and reconciles named intent IDs |
| `fep-program-disposition-v1` | `PROGRAM` | FEP acceptance or rejection of sponsor program configuration | changes portal program projection |
| `fep-reviewed-cohort-v1` | `COHORT` | approved broad cohort and minimum-size count | makes the cohort selectable |
| `fep-public-case-card-v1` | `PUBLIC_CASE_CARD` | consented public-safe context | makes a non-selectable context card visible |
| `fep-allocation-intent-disposition-v1` | `ALLOCATION_INTENT` | FEP acceptance, rejection, or expiry | changes intent readback; acceptance remains held until balance reconciliation |
| `fep-aggregate-impact-v1` | `PROGRAM_IMPACT` | suppressed aggregate outcomes | updates aggregate impact only |
| `fep-sponsor-brand-review-v1` | `SPONSOR_BRAND_VERSION` | FEP safety review of an immutable brand version | approves or rejects that exact content hash |
| `fep-sponsor-campaign-disposition-v1` | `SPONSOR_CAMPAIGN` | FEP policy review of a capped campaign | activates or rejects the exact campaign hash; no money effect |
| `fep-sponsored-outcome-request-disposition-v1` | `SPONSORED_OUTCOME_REQUEST` | case availability and policy readback | holds or releases the portal request; still no reservation or transfer effect |
| `fep-media-event-v1` | `MEDIA_EVENT` | consented public proof lifecycle | advances one public projection state after FEP verification |
| `fep-media-event-withdrawal-v1` | `MEDIA_EVENT` | consent or safety withdrawal | removes the event from the public feed without erasing receipt history |

## Receipt envelope

Each envelope binds `authority`, `contractVersion`, `resourceType`, `resourceId`, `outcome`, `payloadHash`, `receiptId`, `issuedAt`, and `signature` under `receiptHash`.

A matching hash is integrity evidence, not authenticity. The service additionally requires an injected server-side verifier. The default verifier always rejects. The demo verifier accepts one explicit fixture marker and must never be used as production authority.

## Balance reconciliation

1. FEP reports available allocation version N.
2. A sponsor intent enters `SUBMITTED_FOR_FEP_REVIEW`; its amount is held only in the portal's intentable calculation.
3. An accepted FEP disposition enters `ACCEPTED_BY_FEP_AWAITING_PROJECTION`; the hold remains.
4. A later FEP balance projection reports committed value and lists the accepted intent ID.
5. Only that readback changes the FEP-reported available projection and marks the intent reconciled.

This prevents local acceptance handling from inventing a balance change and prevents the brief gap between acceptance and projection from reopening spendable capacity.

## Privacy and selection

Public cards expose only generalized region, category, approved broad tags, public-safe summary, requested context amount, and currency. Consent and review references remain internal. Cards cannot be allocation targets.

Sponsors may target an approved Program or a broad Cohort that meets the minimum-size threshold. FEP independently performs case-level review and recipient selection.

## Specific-outcome rail

Specific-outcome sponsorship is not an allocation target. A sponsor may reference only an FEP-issued public case code inside an active, capped `SPONSORED_DIRECT_GIFT` campaign and must request exactly the published amount. FEP can return `ACCEPTED`, `REJECTED`, `EXPIRED`, or `UNAVAILABLE`; even an accepted response is projected as `ACCEPTED_BY_FEP_NO_EFFECT` until authoritative fulfillment and settlement systems exist.

The request binds campaign, public-card, acknowledgement, correlation, idempotency, currency, and amount hashes. It contains no private case ID or recipient identity.

## Proof lifecycle

Public proof is a versioned FEP projection, not a sponsor-authored success claim. A media event must:

1. begin at version 1 in `FUNDED`;
2. advance exactly one state at a time through `RESERVED`, `SENT_OR_ORDERED`, `DELIVERED`, and `OUTCOME_CONFIRMED`;
3. retain the original campaign, public case code, and approved brand version;
4. include separate recipient-publication and sponsor-publication consent versions;
5. be reconciled before `DELIVERED` or `OUTCOME_CONFIRMED`;
6. support FEP-owned withdrawal without deleting the prior receipt trail.

Only `OUTCOME_CONFIRMED` is labeled a verified outcome.

