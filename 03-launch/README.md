# Phase 3: Launch

Launch converts an approved creative package into a precise, reviewable media
plan and, only when authorized, applies that plan to an advertising account.

## Inputs

- approved Creative package;
- client, account, objective, and conversion-event identifiers;
- channel and placement plan;
- audiences, exclusions, geography, schedule, and bid strategy;
- total budget, daily limits, stop conditions, and approval policy;
- verified tracking and landing-page destinations.

## Workflow

1. Validate account, pixel or SDK, conversion event, domain, destination, and
   permissions.
2. Build the campaign hierarchy, naming, audience, placement, and budget plan.
3. Match approved assets and copy to each ad.
4. Run policy, tracking, URL, format, duplication, and budget checks.
5. Produce a dry-run diff showing every proposed account mutation.
6. Collect explicit approval for the exact diff and budget exposure.
7. Apply through a vendor adapter, read the result back, and save a receipt.

## Outputs

1. `launch-plan.json` — vendor-neutral desired campaign state;
2. `launch-diff.md` — human-readable proposed changes and budget exposure;
3. `preflight-report.json` — validation results and blockers;
4. `approval-record.json` — scope and identity of the approval, when supplied;
5. `launch-receipt.json` — external IDs, readback state, timestamps, and errors.

## Safety boundary

Creating a plan is not permission to launch it. Live account writes, budget
changes, and traffic activation require explicit approval for the exact action.
Adapters must default to dry-run, be idempotent where the platform allows, and
support a documented pause or rollback path.

## Initial build plan

- Define a vendor-neutral campaign and launch-diff schema.
- Implement offline validation and a fixture-backed fake adapter.
- Add tracking, URL, naming, creative, and budget preflight rules.
- Add approval and immutable receipt contracts.
- Implement one real platform adapter only after dry-run and readback tests pass.
- Keep Meta, TikTok, in-app, and programmatic specifics behind adapters.

## Exit criteria

Launch is complete only when desired state, approved state, and platform
readback agree—or when a partial or failed state is preserved with exact
recovery instructions. Platform acceptance never implies campaign performance.

## Learning Core input and output

Launch consumes evidence-backed hypotheses and reviewable proposals, then
writes back only verified preflight, tracking, approval, and readback receipts.
A decision recorded by Draper is local governance evidence, not authorization
to execute an account mutation. Publishing, spend, traffic, and budget changes
still require approval for the exact Launch diff.
