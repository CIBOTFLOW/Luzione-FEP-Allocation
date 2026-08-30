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

