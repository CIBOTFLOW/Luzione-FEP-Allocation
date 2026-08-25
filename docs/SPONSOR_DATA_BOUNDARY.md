# Sponsor Data Boundary

## Allowed sponsor data

- generalized geography;
- case category;
- broad reviewed cohort tags;
- public-safe summary;
- requested and funded amount;
- program restrictions;
- aggregate outcomes above minimum cohort thresholds.

## Prohibited sponsor data

- raw application answers;
- exact diagnosis or medical documents;
- exact address or contact details;
- private identity;
- reward balance or purchase history;
- gratitude or publicity willingness;
- private fraud, verification, or appeal notes.

Sponsors fund through allocation intents. FEP independently validates the intent, retains decision and money authority, and records the final result. The sponsor portal never receives direct approval, transfer, or recipient-contact capability.

## Implementation posture

The Next.js portal is production-shaped but remains `NO_EFFECT`. It uses a mock FEP adapter for UI and contract development until FEP Platform staging APIs, sponsor authentication, legal/accounting controls, privacy review, and live authorization are approved.

The portal may submit allocation intents, sponsor rationale, idempotency keys, and correlation IDs. It must not place service credentials in browser code and must not expose direct case approval, denial, recipient contact, or fund-transfer capability.
