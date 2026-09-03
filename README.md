# Luzione FEP Allocation v0.7

Review-only Sponsor Outcome Studio for `fep.luzione.com`.

The studio turns sponsor funding preferences into bounded, auditable requests that FEP Platform may independently review. It gives a company one place to version its public identity, configure a capped campaign, browse privacy-safe opportunities, request one exact verified outcome by public code, and follow a consented proof event through completion.

It does **not** let a sponsor identify or contact a recipient, inspect private evidence, approve a case, reserve authoritative funds, move money, promise publicity, issue cryptocurrency, or create charitable-deduction language.

## Implemented product slice

- organization membership with viewer, planner, and admin roles;
- immutable sponsor brand versions with SHA-256 asset metadata and FEP review status;
- capped, dated campaigns across three explicit funding rails;
- direct-outcome requests using only an FEP-issued public case code and the exact published amount;
- separate program/cohort allocation intents that continue to prohibit case-level targeting;
- FEP-owned disposition receipts bound to immutable request hashes;
- proof-feed projections across `FUNDED`, `RESERVED`, `SENT_OR_ORDERED`, `DELIVERED`, and `OUTCOME_CONFIRMED`;
- separate publication consent, reconciliation gates, versioned sponsor attribution, and withdrawal readback;
- financial-promise scanning that rejects public copy suggesting a coin, crypto, trading, cash-out, appreciation, yield, investment return, or future conversion entitlement;
- closed-loop product boundaries for nonmonetary **Luzione Impact Points** and funded **Luzione Essentials Credits**;
- tenant audit history and minimum-cohort reporting suppression;
- responsive Sponsor Outcome Studio with campaign, proof, allocation, and authority views;
- production startup that fails closed without a server-side authentication token map.

The current service is an in-memory, no-effect reference implementation. Its fixture verifier and seeded demo are not production authority.

## The three funding rails

| Rail | Sponsor chooses | FEP retains | Current effect |
| --- | --- | --- | --- |
| `MERCHANT_FUNDED_OUTCOME` | an approved merchant/outcome campaign | eligibility, case authority, settlement readback | disabled |
| `SPONSORED_DIRECT_GIFT` | one public case code at the exact published amount | availability, identity, approval, fulfillment, reconciliation | disabled |
| `GOVERNED_PROGRAM_SUPPORT` | an approved program or sufficiently broad reviewed cohort | person-level selection and every authoritative decision | disabled |

The direct-gift rail is intentionally separate from the allocation engine. Adding public-code sponsorship does not weaken the engine's `PROGRAM`/`COHORT` target rule.

## Closed-loop value boundary

`src/luzioneValueBoundary.js` is a product and messaging invariant, not an issued asset or payment rail.

- **Luzione Impact Points** record verified participation and recognition. They have no monetary value, transfer, redemption, eligibility influence, or promised future conversion.
- **Luzione Essentials Credits** may eventually provide closed-loop access to approved essentials, but may be issued only against cleared sponsor funding or committed fulfillment capacity. They have no P2P transfer, cash-out, exchange listing, or appreciation claim.
- Merchant settlement remains fiat or a regulated-provider responsibility. Restricted reserves cannot fund operations.

No blockchain, token, wallet, exchange, treasury sale, or crypto repository is part of this release.

## B07 A02/B03 compatibility proof

The isolated adapters pin controller release `3a9c49fb3b7badb8a35eac1502e2ac3fb1be769c` and evidence decision `a4b85512f113ff15cfe689347d1c9de0edf98123`, plus:

- `CIBOTFLOW/Luzione-API@f2d643a0913b888809c217adfd9bdcef0385b05a` and exactly five `v0.2-draft.1` contracts and artifact digests;
- `CIBOTFLOW/FEP-Platform@526e513b0698c56fefbf5b5918bb025df73e8e9e` and `fep-balanced-journal/v0.1-draft`;
- exact A02 identity, command, receipt, and readback fields;
- exact B03 journal transaction, append index, prior/head hash, balanced postings, durable receipt, replay readback, tenant, finality, balance, and currency fields.

`A02B03AllocationAdapter` consumes the exact durable B03 disposable-Postgres evidence and serializes process-local compatibility claims. `DurableA02B03AllocationAdapter` additionally writes a file-backed G0 command record with an exclusive claim lock, atomic fsync/rename, immutable replay, conflict denial, and record-integrity verification. Together they cover B03 receipt/readback replay plus Allocation process restart and concurrent replay in the rehearsal; neither is a substitute for transactional production Postgres.

The adapter is restricted to `DRAFT_ONLY`, `SYNTHETIC_ONLY`, and `NO_EFFECT`. It cannot write the FEP journal, move money, select a recipient, approve or deny, resolve an appeal, activate runtime behavior, or migrate production data.

Run `npm run proof:b07` for the deterministic evidence packet. `/b07-g0-evidence.json` exposes a public-safe preview vector only; deployment metadata must bind it to a commit.

## Run

```bash
npm run check
npm run proof:b07
npm start
```

Open `http://localhost:8091`. The non-production demo contains synthetic public-safe data and performs no external effect.

## API

```text
GET  /health
GET  /v1/overview
GET  /v1/programs
GET  /v1/cohorts?programId=...
GET  /v1/opportunities?programId=...&cohortId=...
GET  /v1/brand-versions
POST /v1/brand-versions
GET  /v1/campaigns
POST /v1/campaigns
POST /v1/campaigns/:campaignId/submit
GET  /v1/sponsored-outcomes
POST /v1/sponsored-outcomes
GET  /v1/proof-feed
GET  /v1/allocation-intents
POST /v1/allocation-intents
GET  /v1/impact?programId=...
GET  /v1/audit
GET  /v1/settings
```

Sponsor mutations create drafts or review requests only. FEP review ingestion remains a server-side integration boundary and is not exposed as a sponsor route.

## Production authentication boundary

In production, the reference server requires `ALLOC_PORTAL_TOKENS_JSON`, a server-only JSON map from opaque bearer tokens to `{ sponsorCode, subjectId }`. Replace this temporary adapter with an IdP-backed, HttpOnly session and durable organization membership before any production exposure.

Never put the token map, FEP credentials, receipt-verification keys, private case data, or fulfillment-provider secrets in browser code.

## Remaining activation gates

1. Production IdP/session and durable tenant membership.
2. Authenticated live FEP brand, campaign, public-card, request, proof, balance, disposition, and impact endpoints.
3. Transactional Postgres command/idempotency/audit persistence with migration, rollback, and concurrency evidence.
4. Fund custody, restricted-ledger, refund/reversal, merchant-settlement, and reconciliation integrations.
5. Legal, privacy, accounting, tax, payments, accessibility, content, and incident-response approval.
6. A small capped pilot with explicit stop conditions and no public claim beyond verified readback.

This release is G0, synthetic, and no-effect. It is neither integrated nor production-ready, and the design documentation is not legal advice.
