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

The G0-only adapters in `src/a02IdentityTenantAdapter.js`, `src/a02B03AllocationAdapter.js`, `src/b03PostCommitEvidenceAdapter.js`, and `src/b03DurableFundingAdapter.js` pin controller release `1ecf8ead139d4ecd1efc1840c7be6c1bd982d865`, `CIBOTFLOW/Luzione-API@12685f46a60edea23aaa0a5403e300bf8858066b` with final evidence `bc43d5db8fe58230d6c3d35e32a73e1e8618b71e`, exactly all five `v0.2-draft.1` identifiers, and B03 producer `CIBOTFLOW/FEP-Platform@7a50cfa9a9ec599241e936a64a58529868ca81eb` with `fep-balanced-journal/v0.1-draft`.

The API manifest pin distinguishes the authoritative raw-file SHA-256 `2d7479019d04d24344b1d4bf4d953abee2d3382ed56b8201ebb49289253e00b7` from canonical-JSON SHA-256 `eaf983e1496187a22688ddfed45b541fe88a3e2b70a2fbc60863fae1a9484208`; they are different digest domains and are never substituted for each other.

The Allocation-local identity/tenant adapter consumes, but does not redefine, the strict A02 producer shape. It accepts only a server-derived service credential, verified exact tenant, direct (non-delegated) logical actor boundary, and the command-specific draft capability/purpose. It binds that evidence deterministically and rejects caller tenant authority. The compatibility boundary consumes the exact FEP-local fixture as command/precondition input plus FEP-owned post-commit output. It validates the B03 journal schema, PIN, fixtures, rehearsal migration and rollback digests; journal transaction fields; append index and previous/head hashes; durable receipt; replay readback; tenant; balance; object-version transition; and finality. Caller-pre-minted receipt/readback finality is rejected. `DOMAIN_COMMITTED` is accepted only after the FEP append, and `SOURCE_CONFIRMED`/`businessFinal` only after the same tenant/head is read back. Its concurrency-safe replay claim is deliberately process-local G0 evidence, so it does not satisfy durable Allocation integration.

It accepts only server-derived exact-tenant service identity, `DRAFT_ONLY`, `SYNTHETIC_ONLY`, `NO_EFFECT`, FEP-owned domain-committed receipts that grant no effect authority, fresh source-confirmed post-commit readback, and valid balanced B03 replay readback. The adapter produces deterministic local receipts and cannot write the FEP journal, persist an allocation or reservation, call a provider, move money, select a named recipient, approve or deny, resolve an appeal, activate runtime behavior, or migrate production data.

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
