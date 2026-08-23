# Codex Master Prompt — Luzione FEP Allocation v0.5

Initialize this repository as the company-facing portal for `fep.luzione.com`.

## Build sequence

1. Pin the v0.5 public-case-card and allocation contracts.
2. Implement authenticated organization membership and sponsor access policy.
3. Implement programs, available allocation, reviewed cohort definitions, public case cards, and allocation intents.
4. Make exact sensitive values impossible to retrieve through sponsor APIs.
5. Add intent review state and FEP acceptance/rejection readback.
6. Add aggregate reporting with minimum cohort-size suppression.
7. Add audit records for every sponsor view, filter, export, and intent.
8. Add accessible responsive UI for Overview, Programs, Opportunities, Allocations, Impact, and Settings.
9. Add concurrency, authorization, forbidden-field, inference-risk, and idempotency tests.
10. Deploy preview only; production remains gated by FEP access authorization and legal review.

Never add direct FEP database credentials to the browser. Never implement direct sponsor approval, recipient contact, or transfer. Preserve the no-effect reference tests while replacing the in-memory store with authenticated APIs.