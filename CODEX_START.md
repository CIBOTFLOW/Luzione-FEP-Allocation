# Codex Master Prompt — Luzione FEP Allocation v0.7

Initialize this repository as the company-facing portal for `fep.luzione.com`.

## Build sequence

1. Preserve the v0.7 separation between program/cohort allocation and public-code sponsored outcomes.
2. Replace the reference token map with IdP-backed server sessions and durable organization membership.
3. Replace in-memory brand, campaign, sponsored-outcome, proof, balance, and disposition projections with authenticated, versioned FEP APIs and signature verification.
4. Persist sponsor intents, direct-outcome requests, idempotency claims, readback receipts, and audits in transactional Postgres.
5. Add restricted-fund, refund, reversal, merchant-settlement, and reconciliation ledgers only after the payment/custody architecture is approved.
6. Add transaction/concurrency tests around aggregate holds, case availability, and FEP projection reconciliation.
7. Add export audit, consent withdrawal, and purpose-limited retention controls.
8. Verify the responsive browser journeys and degraded FEP states in preview.
9. Keep money movement, points/credit issuance, crypto behavior, and production activation blocked until explicitly approved.

Never add direct FEP database credentials to the browser. Never implement sponsor approval, recipient contact, publicity-conditioned aid, cash-out, P2P transfer, or future-conversion promises. Preserve the no-effect reference tests while replacing the in-memory store with authenticated APIs.
