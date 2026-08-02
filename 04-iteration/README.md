# Phase 4: Iteration

Iteration turns campaign performance into controlled learning. Its job is to
choose the most valuable uncertainty, design a fair test, and make a
reproducible decision without declaring weak evidence a win.

## Inputs

- launch receipt and exact creative manifest;
- normalized delivery, spend, conversion, and lead-quality data;
- attribution window and known tracking limitations;
- current baseline and active experiments;
- business metric, guardrails, budget, and minimum runtime.

## Workflow

1. Diagnose the funnel before proposing a creative change.
2. Rank test opportunities by expected value, cost, and confidence.
3. Select one primary hypothesis and the smallest meaningful variable.
4. Pre-register variants, primary metric, guardrails, minimum sample, and stop
   rules.
5. Generate or select variants through Creative.
6. Launch the approved experiment through Launch.
7. Evaluate results as win, loss, or inconclusive.
8. Record the decision and the next best question.

## Outputs

1. `experiment-plan.json` — hypothesis, variants, allocation, and decision rules;
2. `experiment-readout.md` — result, caveats, and practical interpretation;
3. `experiment-result.json` — normalized evidence and decision;
4. `learning-ledger.jsonl` — append-only record of tests and conclusions;
5. `next-test-queue.json` — ranked, non-duplicative experiment candidates.

## Test hierarchy

Early tests should usually prefer large strategic differences over cosmetic
ones:

1. offer and customer-message fit;
2. angle or promise;
3. hook and opening;
4. format, creator, or visual mechanism;
5. proof and call to action;
6. execution details such as copy length, color, or button treatment.

The correct order depends on the diagnosed bottleneck and available traffic.

## Initial build plan

- Define normalized metric and experiment schemas.
- Add a platform-neutral performance import boundary.
- Implement sample, duration, attribution-delay, and guardrail checks.
- Build a test-prioritization queue with duplicate detection.
- Add deterministic win, loss, and inconclusive fixtures.
- Connect approved variants back to Creative and Launch by immutable IDs.

## Exit criteria

An experiment is complete when the planned evidence window has closed and the
decision, caveats, and next action are recorded. “Not enough evidence” is a
valid result.

## Application workflow contract

The shared application state, visible prerequisite, and operator-facing
handoff appear in [`app/docs/campaign-workflow.md`](../app/docs/campaign-workflow.md).
The initial Iteration UI stays blocked until it has a preserved Launch receipt
and exact Creative package; a missing receipt is not a failed experiment.

## Learning Core input and output

Iteration reads measurements through the normalized warehouse contract and
records attribution and freshness with each outcome. Results attach as
supporting evidence or counterevidence to the exact learning version.
Promotions are sequential and explicit; contradiction preserves both sides of
the evidence rather than silently reversing a conclusion.
