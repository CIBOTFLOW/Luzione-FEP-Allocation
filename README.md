# Luzione FEP Allocation v0.6

Company-facing allocation control center for `fep.luzione.com`.

The service lets an authenticated company member understand an FEP-reported funding position, configure programs, browse consented public-safe context, and submit allocation preferences for approved programs or sufficiently broad reviewed cohorts.

It does not let a sponsor select a named recipient, inspect private evidence, approve a case, reserve FEP funds, or move money.

## Implemented reference slice

- tenant membership with viewer, planner, and admin roles;
- recursive canonical hashes and idempotent sponsor commands;
- FEP-reported available-allocation projections with monotonic versions;
- verified FEP receipt injection that fails closed unless a server-side verifier accepts the receipt;
- draft program configuration and FEP acceptance/rejection readback;
- reviewed cohort projections with minimum-size privacy enforcement;
- consented public-safe case cards that cannot become allocation targets;
- program/cohort allocation intents with pending holds that prevent aggregate overcommitment;
- hash-bound FEP intent disposition and later balance reconciliation;
- aggregate impact with small-cohort metric suppression;
- tenant audit records for sponsor views and intent creation;
- accessible responsive Overview, Programs, Opportunities, Allocations, Impact, and Settings UI;
- production startup that fails closed without an authentication token map.

The in-memory service and fixture receipt verifier are no-effect reference infrastructure. Production must replace both with authenticated FEP APIs and durable storage.

## B07 A02/B03 compatibility proof

The G0-only adapter in `src/a02B03AllocationAdapter.js` pins the corrected controller release, `CIBOTFLOW/Luzione-API@f2d643a0913b888809c217adfd9bdcef0385b05a`, exactly all five `v0.2-draft.1` identifiers and artifact digests, and `CIBOTFLOW/FEP-Platform@5e9b64528c536b9a5b6b283422a171438f09dd48` with `fep-balanced-journal/v0.1-draft`.

It accepts only server-derived exact-tenant identity, `DRAFT_ONLY`, `SYNTHETIC_ONLY`, `NO_EFFECT`, domain-committed receipts that grant no effect authority, and fresh source-confirmed readback. The adapter produces deterministic local receipts and cannot write the FEP journal, move money, select a named recipient, approve or deny, resolve an appeal, activate runtime behavior, or migrate production data.

Run `npm run proof:b07` for the reproducible fixture packet. A deployed branch may expose the same public-safe vector at `/b07-g0-evidence.json`; deployment metadata, not the file itself, binds it to a commit SHA.

## Run

```bash
npm run check
npm start
```

Open `http://localhost:8091`. Non-production uses an explicitly seeded demo membership. The demo contains no real recipient data and performs no external effect.

## API

```text
GET  /health
GET  /v1/overview
GET  /v1/programs
GET  /v1/cohorts?programId=...
GET  /v1/opportunities?programId=...&cohortId=...
GET  /v1/allocation-intents
POST /v1/allocation-intents
GET  /v1/impact?programId=...
GET  /v1/audit
GET  /v1/settings
```

Allocation intent targets are limited to `PROGRAM` and `COHORT`. `PUBLIC_CASE_CARD`, case IDs, recipient IDs, names, addresses, contacts, and raw evidence fail closed.

## Production authentication boundary

In production, the reference server requires `ALLOC_PORTAL_TOKENS_JSON`, a server-only JSON map from opaque bearer tokens to `{ sponsorCode, subjectId }`. This is a temporary adapter contract, not the end-state login system. Replace it with an IdP-backed, HttpOnly session and durable organization membership before production exposure.

Never put the token map, FEP credentials, or receipt-verification keys in browser code.

## FEP readback

Every authoritative projection or disposition must be bound to:

- an exact contract version;
- an FEP resource type and identifier;
- a canonical payload hash;
- an immutable receipt ID and timestamp;
- a canonical receipt hash;
- a signature/authenticity result supplied by the server-side verifier.

The default verifier rejects everything. The demo verifier accepts only the explicit fixture signature. See `docs/FEP_READBACK_CONTRACTS.md`.

## Remaining activation gates

1. Production IdP/session and durable tenant membership.
2. Authenticated live FEP program, cohort, public-card, balance, disposition, and impact endpoints.
3. Durable Postgres intent/audit persistence with concurrency tests.
4. Legal, privacy, accounting, and access-policy approval.
5. Preview verification and recovery drills.

B07 integration additionally waits for A02 and B03 G1 acceptance. This branch evidence is G0 and must not be described as integrated or production-ready.

Even after those gates, the portal creates sponsor preferences only. FEP continues to own named-recipient decisions, reservations, fulfillment, and money authority.
