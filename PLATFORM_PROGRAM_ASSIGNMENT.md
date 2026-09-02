# Luzione Platform Program Assignment

**Controller:** [CIBOTFLOW/Luzione-platform-program](https://github.com/CIBOTFLOW/Luzione-platform-program)  
**Authoritative queue:** [queue/program-queue.json](https://github.com/CIBOTFLOW/Luzione-platform-program/blob/main/queue/program-queue.json)  
**Repository:** `CIBOTFLOW/Luzione-FEP-Allocation`  
**Local assignment branch:** `feat/fep-allocation-v0.3`

This file is a local mirror for this repository's Codex project. Before work, reconcile it with the controller queue and the linked controller issues. The controller queue wins if this mirror becomes stale.

## Current queue items

- **B07** — `blocked_human` — [controller issue](https://github.com/CIBOTFLOW/Luzione-platform-program/issues/14) — Productionize deterministic allocation against FEP truth

## One-time Codex instruction

```text
Read PLATFORM_PROGRAM_ASSIGNMENT.md completely. Reconcile the current repository
head with the controller queue. Execute the first task for this repository marked
ready, publish the required handoff, then re-check the controller queue and
continue automatically while another same-repository task is ready. Stop only at
an unresolved dependency, shared-contract lock, destructive operation,
credential/production gate or explicit human approval. Never treat a merge as
controller acceptance.
```

---

# Persistent Assignment — CIBOTFLOW/Luzione-FEP-Allocation

This is the complete controller queue for this repository. A Codex project should be prompted once, then work continuously through items that the controller marks `ready`.

## Operating instruction

1. Read `AGENTS.md`, `EXECUTION_PROGRAM.md`, `queue/program-queue.json`, `queue/CONTROLLER_PROTOCOL.md` and the relevant accepted handoffs.
2. Reconcile the actual repository head, open PRs, workflows and deployments before modifying code.
3. Claim only the first item for this repository whose status is `ready`.
4. Implement through its acceptance gate; publish the standard handoff.
5. Re-read the queue. Continue automatically only if another item for this repository is now `ready`.
6. Stop at unresolved dependency, shared-contract lock, destructive action, credential, production or human gate.
7. Never interpret a merge as controller acceptance.

## B07 — Productionize deterministic allocation against FEP truth

- **Phase:** P2
- **Track:** fep-partner
- **Status:** `blocked_human`
- **Prompt sources:** Prompt 15
- **Dependencies:** A02, B03, G01
- **Human gates:** create/protect main and change default branch

### Acceptance

- durable identity/membership/policy state
- reproducible allocation receipts
- fairness/privacy/appeal tests
- journal reconciliation
- deployment and rollback

## Required closeout

Commit the code and repository-local handoff. Report exact SHAs, tests, deployment IDs, negative-path proof, rollback, residual blockers and the next queue item. The controller—not the application project—accepts evidence and changes scores.

