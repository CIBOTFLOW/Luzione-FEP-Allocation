# Codex Master Prompt — Luzione FEP Allocation v0.6

Initialize this repository as the company-facing portal for `fep.luzione.com`.

## Build sequence

1. Preserve the v0.6 public-safe, program/cohort-only sponsor boundary.
2. Replace the reference token map with IdP-backed server sessions and durable organization membership.
3. Replace in-memory FEP projections with authenticated, versioned FEP APIs and signature verification.
4. Persist sponsor intents, idempotency claims, readback receipts, and audits in Postgres.
5. Add transaction/concurrency tests around aggregate intent holds and FEP projection reconciliation.
6. Add export audit and purpose-limited retention controls.
7. Verify the responsive browser journeys and degraded FEP states in preview.
8. Keep production blocked until access authorization, privacy, accounting, and legal review are attributed.

Never add direct FEP database credentials to the browser. Never implement direct sponsor approval, recipient contact, or transfer. Preserve the no-effect reference tests while replacing the in-memory store with authenticated APIs.
