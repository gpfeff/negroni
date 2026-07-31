---
name: negroni-loop
description: Operate Negroni's continuous learning loop across Research, Creative, Launch, and Iteration. Use for Phase 5 monitoring, next-action selection, fatigue or saturation review, proposal queues, loop policies, waiting states, guarded automation, or continuous campaign improvement.
---

# Negroni Loop

Compound learning through bounded, reviewable cycles. Never hide failed, blocked, stale, partial, or inconclusive runs.

## Inputs

- Append-only learning ledger and fresh normalized campaign evidence.
- Creative-fatigue and audience-saturation indicators.
- Open Research questions, active experiments, attribution delays, capacity, budget, policy, and approval constraints.

## Cycle

1. Observe verified evidence.
2. Diagnose the most important constraint or uncertainty.
3. Refresh only the Research needed for that question.
4. Propose one bounded hypothesis and candidate Creative change.
5. Validate provenance, policy, format, budget, tracking, and experiment design.
6. Route any external mutation through Launch approval.
7. Wait for the declared evidence window.
8. Decide to keep, stop, revert, or mark inconclusive.
9. Append the result and select the next uncertainty.

## Control model

- `Observe`, `Draft`, and `Validate` may run unattended within configured limits.
- `Recommend` creates no external change.
- `Act` changes an account, spend, publication, or traffic and requires approval for the exact action.

## Durable outputs

Create or update:

1. `loop-policy.json`
2. `loop-state.json`
3. `proposal-queue.json`
4. `loop-events.jsonl`
5. `loop-report.md`

Stop on budget, tracking, policy, data-quality, authorization, or operational guardrail failures. A configured schedule is not running until a current receipt proves it.

## Draper and Learning Core

Draper is Loop's conversational control plane. Retrieve current brand-scoped learnings, normalized outcomes, contradictions, retrieval receipts, and freshness through validated tools. Draper may propose the next experiment or Loop-policy diff and may record an explicitly approved local decision; it never executes that proposal. Keep the relational database authoritative, the vault generated and readable, and vector indexes disposable.
