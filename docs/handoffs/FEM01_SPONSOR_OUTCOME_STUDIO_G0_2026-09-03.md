# FEM01 Sponsor Outcome Studio G0 handoff

## Identity, scope, and writer boundary

- Repository: `CIBOTFLOW/Luzione-FEP-Allocation`
- Branch: `codex/fem01-sponsor-outcome-studio`
- Authorized starting SHA: `4cf3a5aec5a79d5b86cc4a346927bbaa5e9f1461`
- Initial product implementation SHA: `635cb897f1c20b57579294c92cafa7cd59987b0f`
- Upstream durable B03 compatibility SHA: `6452e4b5fe86c57eb605fb597ef41118b3ca9bb3`
- Combined product and compatibility SHA: `5d4be968ae31a1dab65ac0807ac7cf67c476d441`
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

### UI follow-on implemented from `FEP Thoughts(1).docx`

- separated the public Luzione app, sponsor workspace, and explicitly internal FEP OS;
- made the public movement feed the default view, with Trending as the main order and Latest/Following alternatives;
- added Happy Moments horizontal reels, account/location headers, captions under media, and an 88%-width square image treatment;
- added local photo, image-slideshow, and single-video selection with previews and strict metadata validation;
- added heart, X-style threaded/photo comments, send, bookmark, and follow interactions, with no repost action;
- combined verified FEP support posts and clearly differentiated voluntary updates in one continuously growing feed;
- added an internal support ledger with receipt acknowledgement, validation requirements, lifecycle state, and optional-posting status;
- added a masked priority queue for generalized needs, immediacy bands, and policy-safe factors, with Sultan explicitly limited to decision support and FEP human review authoritative;
- added overall/daily impact, system-by-system health, evaluation evidence, governance metrics, and a living program-knowledge panel;
- kept recipient identity, exact need evidence, urgency/prioritization logic, and authority outside the public app.

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
- `luzione-movement-post-v0.1-draft`
- `luzione-movement-comment-v0.1-draft`
- `luzione-movement-interaction-v0.1-draft`
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
- Controller release: `3a9c49fb3b7badb8a35eac1502e2ac3fb1be769c`
- Controller evidence decision: `a4b85512f113ff15cfe689347d1c9de0edf98123`
- FEP journal pin SHA-256: `939aa1c8337b2d18295c70a670b006cbc49137a46a46120fa27f420c00637fe6`
- FEP journal schema SHA-256: `5023cebce38e4bb43a7372aad85bc457c48d9adf62b8ab9ab3d02a26ac0a54c4`
- Deterministic adapter receipt: `11856c72203ecdd8e62b3ad992a1022914e84a3316179e4dc029d54ef79f0970`
- Inner allocation receipt: `e9e65a7d1f4b28a9b68adce9c3dac4bdee6387613cdd43550138533f6fdce354`
- Allocation snapshot: `e3f42958b35015a32f3f75ba0899a41f967f09363486717db666b7df8717bdf2`
- Concurrent proof: 24 exact deliveries produce 1 simulation, 23 replays, and 1 file-backed durable record.
- Durable command key: `40704175d8bfbf53a0b657b98671f87c14d30a1da7414dc354b529aa700f6fae`
- Effect diagnostics remain zero for FEP journal writes, money effects, provider effects, runtime activation, and production migration.

The file store uses an exclusive command lock, immutable input/receipt hashes, atomic rename, file and directory fsync, and tamper detection. It is G0 restart/concurrency evidence, not production transactional storage.

## Verification

- Equivalent build/test checks — pass: JavaScript syntax validation and 80/80 tests after the movement-media and internal FEP OS UI follow-on.
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
3. Production identity, transactional Postgres, durable post/comment storage, object storage/scanning/moderation, restricted funds, refunds/reversals, merchant settlement, and reconciliation remain unimplemented.
4. Legal, tax, accounting, privacy, payments, custody, sanctions, accessibility, content, support, incident-response, and pilot operating approvals are required.
5. Rendered desktop/mobile browser verification and a recoverable preview deployment are still required.
6. Points/credits issuance and every crypto behavior remain blocked; no future conversion may be promised.

## One next action

Have the controller validate this exact branch evidence, then define the authenticated FEP read APIs and a capped manual pilot runbook before any payment or public launch work.
