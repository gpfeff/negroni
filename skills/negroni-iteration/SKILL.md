---
name: negroni-iteration
description: Turn normalized campaign evidence into controlled Negroni experiments. Use for Phase 4 performance diagnosis, test prioritization, experiment design, variant allocation, attribution checks, readouts, win-loss-inconclusive decisions, or next-test queues.
---

# Negroni Iteration

Choose the most valuable uncertainty and design a reproducible test. Preserve insufficient or delayed evidence instead of declaring a winner.

## Required inputs

- Launch receipt and exact Creative manifest.
- Normalized delivery, spend, conversion, and lead-quality evidence.
- Attribution window, tracking limitations, baseline, guardrails, budget, and minimum runtime.

## Workflow

1. Diagnose the funnel before proposing a creative change.
2. Rank opportunities by expected value, cost, confidence, and duplication risk.
3. Select one primary hypothesis and the smallest meaningful variable.
4. Pre-register variants, allocation, primary metric, guardrails, minimum evidence, and stop rules.
5. Route new variants through Creative and any external change through Launch.
6. Wait for the declared evidence window and attribution delay.
7. Record the outcome as win, loss, or inconclusive with caveats and the next question.

## Durable outputs

Create or update:

1. `experiment-plan.json`
2. `experiment-readout.md`
3. `experiment-result.json`
4. `learning-ledger.jsonl`
5. `next-test-queue.json`

Do not optimize cheap leads at the expense of qualification, compliance, capacity, or customer harm. Experiment design never bypasses Launch approval.
