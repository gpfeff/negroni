# Phase 5: Loop

Loop is Negroni's continuous learning system. It connects performance,
research, creative, launch, and experimentation so each cycle starts with more
evidence than the last.

The design is inspired by
[Andrej Karpathy's `autoresearch`](https://github.com/karpathy/autoresearch):
make a bounded change, run a comparable experiment, evaluate a fixed metric,
keep or discard the change, log the result, and repeat.

Negroni adapts that pattern to advertising, where experiments involve money,
people, delayed attribution, platform rules, and noisy outcomes.

## Inputs

- append-only learning ledger;
- fresh campaign and lead-quality data;
- creative fatigue and audience-saturation indicators;
- unresolved Research questions;
- client capacity, budget, policy, and approval constraints;
- current baseline and active experiment registry.

## The cycle

1. **Observe:** ingest validated delivery, conversion, lead-quality, and
   operational evidence.
2. **Diagnose:** identify the most important constraint or uncertainty.
3. **Research:** refresh only the evidence needed for that uncertainty.
4. **Propose:** create a bounded hypothesis and candidate creative.
5. **Validate:** check provenance, policy, format, budget, and experiment design.
6. **Approve:** obtain the approval required by the configured action policy.
7. **Run:** launch or update only the approved experiment.
8. **Measure:** wait for the pre-registered evidence window and guardrails.
9. **Decide:** keep, stop, revert, or mark inconclusive.
10. **Record:** append the result and choose the next uncertainty.

## Outputs

1. `loop-policy.json` — allowed actions, budgets, gates, and stop conditions;
2. `loop-state.json` — baseline, current experiment, and waiting conditions;
3. `proposal-queue.json` — ranked research and experiment proposals;
4. `loop-events.jsonl` — append-only actions, approvals, results, and failures;
5. `loop-report.md` — readable account of what changed and what was learned.

## Control model

Loop actions should be classified rather than treated as equally safe:

- **Observe:** read and normalize existing evidence.
- **Draft:** prepare research, concepts, assets, plans, or experiment proposals.
- **Validate:** run local checks and fixture-backed simulations.
- **Recommend:** present an external change for approval.
- **Act:** mutate an account, change spend, publish, pause, or launch traffic.

Observe, Draft, and Validate may run unattended within configured resource
limits. Recommend creates no external change. Act requires the approval policy
to authorize the exact action; Negroni defaults to human approval.

## Decision rules

- Use one declared primary metric, such as qualified cost per lead, with
  secondary guardrails.
- Do not optimize cheap leads at the expense of qualification, sales capacity,
  compliance, or customer harm.
- Use fixed budget and time boundaries where practical so experiments remain
  comparable.
- Account for attribution delay and minimum evidence before making a decision.
- Keep a known baseline and a reversible path.
- Never hide failed, blocked, or inconclusive runs.
- Stop automatically on budget, tracking, policy, data-quality, or operational
  guardrail violations.

## Initial build plan

- Define loop policy, state, event, and proposal schemas.
- Build a local fixture simulator with no ad-account access.
- Implement the Observe → Diagnose → Draft → Validate path first.
- Add an approval queue and immutable action receipts.
- Add waiting states for sample size, attribution delay, and client capacity.
- Connect one Research refresh and one Creative experiment end to end.
- Add live adapters only after dry-run, idempotency, readback, stop, and budget
  tests pass.

## Exit criteria

The first complete Loop milestone is a fixture-backed cycle that identifies an
uncertainty, refreshes Research, creates a Creative proposal, prepares a Launch
diff, evaluates a simulated Iteration result, and appends a Learning entry
without making any live external change.

## Draper and central Learning Core

Draper is the natural-language control plane over Loop state. It retrieves
brand-scoped catalog records, outcomes, learnings, contradictions, and
freshness through validated intents; it never accepts arbitrary SQL. It may
prepare an experiment or Loop-policy diff and record an exact approved local
decision, but a proposal or decision performs no external action. SQLite is
the current authority, FTS5 is dependable retrieval, vector entries are
rebuildable, and the vault is a human-readable projection.
