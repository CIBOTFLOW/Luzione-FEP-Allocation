# B07 deterministic allocation G0 handoff

## Identity and writer lock

- Repository: `CIBOTFLOW/Luzione-FEP-Allocation`
- Branch: `codex/b07-deterministic-allocation-v0.1`
- Starting SHA: `ac8d1e52d7a13a761d9c5225ed4ba1c95aecffc3`
- Exact candidate SHA: `1fffc7a8956b02c260757e61a3df59ed4c069a8a`
- Writer lock: `lane-agent-L4` held only this repository from `2026-09-02T20:52:41Z`; the FEP-Platform lock was released first and Sultan-FEP remained read-only.
- Gate: G0 development only. This candidate is not integrated or production-ready.

## Changed paths at the candidate SHA

- `.github/workflows/allocation-validation.yml`
- `contracts/B07_PIN.json`
- `fixtures/b07/deterministic-allocation.json`
- `src/contractPins.js`
- `src/deterministicAllocator.js`
- `tests/deterministic-allocation.test.js`

## Pinned contracts

- Controller release: `19cf3a752f761a632349ab2581efc2730a557964`
- API owner: `CIBOTFLOW/Luzione-API`
- API drafts: `luzione-request-identity/v1`, `luzione-command-ledger/v0.1`, `luzione-causal-readback/v0.1`
- API producer SHA: intentionally `null`; the known shapes are transitional and B07 integration remains blocked pending an exact A02 producer candidate.
- FEP owner: `CIBOTFLOW/FEP-Platform`
- FEP draft: `fep-balanced-journal/v0.1-draft` at implementation SHA `e8490fb606d6c8534180bb0412186534143cc510`
- FEP schema SHA-256: `5023cebce38e4bb43a7372aad85bc457c48d9adf62b8ab9ab3d02a26ac0a54c4`
- FEP policy: `fep-policy-rules-v1`
- Allocation adapter/receipt: `luzione-fep-allocation-simulation/v0.1-draft`, `luzione-fep-allocation-receipt/v0.1-draft`

## Behavior and receipt evidence

- Deterministic weighted allocation operates only on FEP-provided opaque eligibility references, a pinned policy, and a recent FEP journal projection.
- Fixture SHA-256: `970fc0163a2d07a491b2ac1aac5eaf9de6fcc6caeb39dac8e8fc1f95a6d1170a`
- Canonical fixture snapshot hash: `13ed4013dca9a9ed598b28556c88abf7b74f25635c14be24b7af6db3b3b61567`
- Reproducible receipt hash: `ec82752580df28a7ad6e9b00b579d77d03668964ddd29f0ceb25cf90595ccb5c`
- Fixture allocation: 600 USD minor units deterministically split 300/200/100; receipt authority permanently denies FEP journal writes, money movement, approval/denial, and sponsor named-recipient selection.
- Every allocation carries an opaque FEP-owned appeal reference; the adapter cannot resolve appeals.

## Verification

- `npm run check` — pass: JavaScript syntax checks and 23/23 tests.
- GitHub `Allocation control center validation` run `33683797749` — success at exact SHA `1fffc7a8956b02c260757e61a3df59ed4c069a8a`.
- Workflow now includes `codex/**` non-default branches so future L4 candidates receive exact-SHA validation.

## Immutable preview evidence

This repository has no GitHub deployment records and no preview deployment workflow. The immutable G0 behavior preview is therefore the committed fixture and expected receipt hash above, re-executed by exact-SHA GitHub run `33683797749`. No HTTP preview or deployed integration is claimed; that missing evidence remains a G1 risk.

## Negative, replay, fairness, privacy, appeal, and failure evidence

- Candidate order changes replay the exact same allocation receipt.
- Same tenant/idempotency key with changed input fails as `IDEMPOTENCY_CONFLICT`.
- Cross-tenant identity, expired identity, stale/future funding, API/FEP contract drift, insufficient FEP projection, insufficient candidate caps, and snapshot tampering fail closed.
- Prohibited keys plus email/phone/street patterns fail before allocation.
- Fairness-group labels never enter the allocation calculation; mutating them leaves allocation decisions unchanged.
- Small-group fairness diagnostics are suppressed at the pinned minimum group size.
- Appeals are always supported by FEP and never adjudicated by this consumer.

## Rollback proof

The candidate is a no-effect branch with no storage, schema, provider, credential, or deployment mutation. Rollback is a non-default-branch revert of commits `a47f55642cd01ba99c2e00a61c7096422026315c` and `1fffc7a8956b02c260757e61a3df59ed4c069a8a`; acceptance is the original 16-test `npm run check` gate and absence of the B07 pin/fixture/adapter paths. Production rollback was neither required nor performed.

## Risks and true stops

- The API pin has no exact A02 producer SHA, so identity/command/readback integration is not proven.
- The adapter consumes the B03 G0 draft, not an accepted G1 FEP release.
- Replay storage remains process-local reference state; durable database integration and concurrency proof remain future work.
- No immutable HTTP preview exists.
- B07 integration waits for A02/B03 compatibility. Default-branch changes, production deployment/migration, and production rollback require explicit human G2 GO.

## One next action

When Luzione-API publishes an exact A02 draft candidate, replace the `null` API producer SHA in `contracts/B07_PIN.json` and run producer/consumer compatibility tests at exact SHAs before asking the controller for G1 validation.
