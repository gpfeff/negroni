---
name: negroni-launch
description: Prepare and validate a Negroni campaign launch package. Use for Phase 3 media plans, account structures, tracking checks, budgets, dry-run diffs, preflight reports, approval records, platform adapters, publishing, or launch requests.
---

# Negroni Launch

Default every vendor integration to dry-run. A plan or creative approval is never permission to mutate an ad account.

## Required inputs

- Approved Creative package and immutable asset identifiers.
- Verified account, objective, conversion event, domain, destination, audience, schedule, bid, budget, and stop conditions.
- Approval policy and rollback or pause path.

## Prepare the launch

1. Verify connected-account identity and permissions.
2. Validate tracking, destination, policy, format, naming, duplication, audience, schedule, and budget exposure.
3. Build vendor-neutral desired state behind stable platform adapters.
4. Produce a human-readable dry-run diff of every proposed mutation.
5. Report blockers, expected spend exposure, and recovery path.
6. Stop before any external write unless the user explicitly approves that exact diff and action.

## Apply only after exact approval

After approval, apply only the approved mutation, read the platform state back, compare desired, approved, and actual state, and preserve partial or failed outcomes with recovery instructions.

## Durable outputs

Create or update:

1. `launch-plan.json`
2. `launch-diff.md`
3. `preflight-report.json`
4. `approval-record.json`
5. `launch-receipt.json`

Never infer platform acceptance, active delivery, or campaign performance from a successful request alone.

## Learning Core contract

Use Learning Core evidence to explain why a launch package or experiment was proposed, but keep recommendations, recorded decisions, and external execution separate. A Draper approval record is not authorization to publish, spend, change a budget, launch traffic, or mutate an ad account. Write only verified launch and tracking receipts back as scoped evidence.
