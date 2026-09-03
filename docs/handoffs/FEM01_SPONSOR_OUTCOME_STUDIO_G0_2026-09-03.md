# FEM01 Sponsor Outcome Studio G0 handoff

## Identity, scope, and writer boundary

- Repository: `CIBOTFLOW/Luzione-FEP-Allocation`
- Branch: `codex/fem01-sponsor-outcome-studio`
- Authorized starting SHA: `4cf3a5aec5a79d5b86cc4a346927bbaa5e9f1461`
- Product implementation SHA: `635cb897f1c20b57579294c92cafa7cd59987b0f`
- Exact FEP producer preserved read-only: `CIBOTFLOW/FEP-Platform@526e513b0698c56fefbf5b5918bb025df73e8e9e`
- Exact API producer preserved read-only: `CIBOTFLOW/Luzione-API@f2d643a0913b888809c217adfd9bdcef0385b05a`
- Gate: G0 isolated, synthetic, and no-effect. No default branch, deployment, credential, provider, database, or production state was changed.

## Product delivered

The Allocation portal is now a Luzione **Sponsor Outcome Studio** with these bounded workflows:

- register immutable sponsor name, tagline, and safe logo metadata versions for FEP review;
- configure dated, capped campaigns with category, region, per-outcome, attribution, dignity, non-charitable, and closed-loop restrictions;
- browse privacy-safe outcomes by FEP-issued public code;
- request one exact outcome through a direct-gift rail without receiving identity, contact, or private evidence;
- retain the pre-existing program/cohort allocation rail without allowing public-card or named-recipient targets;
- show consented FEP proof through `FUNDED`, `RESERVED`, `SENT_OR_ORDERED`, `DELIVERED`, and `OUTCOME_CONFIRMED`;
- pin historical sponsor attribution to an approved immutable brand version and withdraw public media on FEP readback;
- expose nonmonetary Impact Points and funded closed-loop Essentials Credits as product boundaries only.

The demo contains one reconciled confirmed outcome and one available outcome whose sponsor action produces a review request. All mutations remain `effectMode: DISABLED`.

## Value and crypto boundary

- **Luzione Impact Points** have no monetary value, transfer, redemption, eligibility influence, or future-conversion entitlement.
- **Luzione Essentials Credits** are specified only as closed-loop access issued against cleared funds or committed fulfillment; no credit issuance or spend ledger exists in this release.
- P2P transfer, cash-out, exchange listing, appreciation claims, staking, yield, airdrops, presales, wallets, minting, and investment language are prohibited.
- Public copy claiming a charitable contribution or tax deduction is prohibited.
- Merchant settlement remains fiat or regulated-provider work behind legal, accounting, custody, tax, and payments gates.
- No cryptocurrency, token, blockchain, smart contract, wallet, exchange, or treasury code was created.

## New contract and readback surfaces

- `luzione-sponsor-brand-version-v0.1-draft`
- `luzione-sponsor-campaign-v0.1-draft`
- `luzione-sponsored-outcome-request-v0.1-draft`
- `fep-sponsor-brand-review-v1`
- `fep-sponsor-campaign-disposition-v1`
- `fep-sponsored-outcome-request-disposition-v1`
- `fep-media-event-v1`
- `fep-media-event-withdrawal-v1`
- `luzione-closed-loop-value-boundary/v0.1-draft`
- `luzione-fep-allocation-command-store/v0.1-draft`

All FEP projections require an injected server-side authenticity verifier plus exact authority, contract, resource, payload, receipt, timestamp, and integrity bindings. The browser has no FEP receipt-ingestion route.

## B07 exact-pin and durable replay evidence

- API producer: `f2d643a0913b888809c217adfd9bdcef0385b05a`
- Exact API contract set: five `v0.2-draft.1` artifacts with pinned SHA-256 digests.
- FEP producer: `526e513b0698c56fefbf5b5918bb025df73e8e9e`
- FEP journal pin SHA-256: `034f731158fbc77d1de46fcf18fb7d31dbca83cc28faec0ef8e3b6dcfa4aa726`
- FEP journal schema SHA-256: `ddca46acc4501ed1a60a61c0eaaddd431efd02f9b945b2b1ffb3a7f3163192fb`
- Deterministic adapter receipt: `202aa0f9e435b96491287cf789fc5fb4b1e4b65078443c3c635919927f9b5c8f`
- Inner allocation receipt: `2df167dfdd621bcacccc30f8a7a4ca0f2e17058c5d825347f2c1ef96449d1df5`
- Allocation snapshot: `77205f99b1b2981d0111f229a18655c68b8522f97424d99d62c7a972f1a337df`
- Concurrent proof: 24 exact deliveries produce 1 simulation, 23 replays, and 1 file-backed durable record.
- Durable command key: `40704175d8bfbf53a0b657b98671f87c14d30a1da7414dc354b529aa700f6fae`
- Effect diagnostics remain zero for FEP journal writes, money effects, provider effects, runtime activation, and production migration.

The file store uses an exclusive command lock, immutable input/receipt hashes, atomic rename, file and directory fsync, and tamper detection. It is G0 restart/concurrency evidence, not production transactional storage.

## Verification

- `npm run check` — pass: syntax validation and 61/61 tests.
- `npm run proof:b07` — pass: exact pins, deterministic hashes, balanced 600-minor-unit fixture, durable concurrent replay, and zero-effect diagnostics.
- HTTP startup/mutation suite — pass: home/security headers, health, brand and campaign drafts, campaign submit, direct-outcome creation/replay, proof feed, settings, and prohibited financial copy.
- Static UI contract — pass: unique IDs, closed navigation targets, explicit button behavior, global loading/error status, text-only rendering, API wiring, Luzione-only naming, keyboard focus, three responsive breakpoints, and reduced-motion behavior.
- Automated rendered-browser screenshot — not produced. The environment had no browser binary; the prescribed Playwright Chromium download failed through the network proxy with CDN `502`/timeout responses. This is an infrastructure limitation and remains an explicit preview check rather than a claimed pass.

## Negative and recovery evidence

- Named-recipient/public-card allocation targets, hidden identity fields, raw evidence, PII-like text, cross-tenant access, and undersized cohorts fail closed.
- Missing dignity/closed-loop acknowledgements, amount drift, campaign scope drift, exhausted caps, duplicate case holds, and changed idempotency payloads fail closed.
- Token/coin/crypto/wallet/mint/trading/cash-out/appreciation/profit/investment/staking/yield/airdrop copy and charitable/tax-deduction copy fail closed.
- Unverified/tampered FEP receipts, hash drift, stale/future evidence, contract drift, lifecycle jumps, unreconciled delivery claims, and missing publication consent fail closed.
- Exact sponsorship replays return current FEP status; late media and withdrawal receipt replays return the current projection.
- Durable command conflict and record tampering cannot overwrite the committed receipt; a failed simulation leaves no command record and a corrected retry succeeds.
- FEP can withdraw current public media without removing its historical receipt evidence.

## Rollback

This branch has no external effect or production mutation. Repository rollback is to stop reviewing/deploying the branch or revert to starting SHA `4cf3a5aec5a79d5b86cc4a346927bbaa5e9f1461`. The added file-backed proof uses caller-supplied test/temp directories only and creates no repository or production data. No production rollback was required or performed.

## Residual blockers and true stops

1. A02/B03 controller G1 acceptance remains external to this repository.
2. Live authenticated FEP brand, campaign, availability, disposition, media, balance, and impact integrations do not exist here.
3. Production identity, transactional Postgres, asset storage/scanning, restricted funds, refunds/reversals, merchant settlement, and reconciliation remain unimplemented.
4. Legal, tax, accounting, privacy, payments, custody, sanctions, accessibility, content, support, incident-response, and pilot operating approvals are required.
5. Rendered desktop/mobile browser verification and a recoverable preview deployment are still required.
6. Points/credits issuance and every crypto behavior remain blocked; no future conversion may be promised.

## One next action

Have the controller validate this exact branch evidence, then define the authenticated FEP read APIs and a capped manual pilot runbook before any payment or public launch work.

