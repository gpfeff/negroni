# Campaign workflow contract

This contract is the shared application model for Negroni's five phases. It
defines durable handoffs and operator-facing states before phase-specific
execution is added. It does not authorize a provider, paid generation,
publication, budget change, or live account mutation.

## Common state model

Every phase uses the same truthful state vocabulary:

- `needs_input` — the operator has not supplied a required input;
- `ready_for_review` — required material exists and is waiting for review;
- `approval_required` — the next consequential action has a defined approval;
- `approved` — the exact input or handoff is approved and immutable;
- `running` — bounded work is in progress with a receipt or recovery state;
- `complete` — output and validation are preserved for the next phase;
- `blocked`, `partial`, or `failed` — the reason, evidence, and safe next
  action remain visible.

No UI may represent an unpersisted artifact as complete or approved.

## Screen contracts

| Phase | Primary job | Required handoff | Output | Default state today | Safe primary action |
| --- | --- | --- | --- | --- | --- |
| Research | Create an approved evidence package | Brand and offer intake | `creative-brief.json` | Existing Research workflow and approval workspace | Open Research |
| Create | Create reviewable concepts, assets, and copy | Approved `creative-brief.json` | `creative-manifest.json`, `launch-copy.json` | Editor opens only for the selected approved revision and fingerprint | Open Create |
| Launch | Prepare a reviewable delivery plan | `creative-manifest.json`, `launch-copy.json` | `launch-diff.md`, `launch-receipt.json` | Blocked: durable handoff verification is not connected | Open Create |
| Iterate | Select one controlled next experiment | `launch-receipt.json`, `creative-manifest.json` | `experiment-result.json`, `learning-ledger.jsonl` | Blocked: durable handoff verification is not connected | Open Launch |
| Loop | Choose the safest, highest-value next action | `learning-ledger.jsonl`, `experiment-result.json` | `loop-state.json` | Blocked: durable handoff verification is not connected | Open Iterate |

Each page presents exactly one title, one current state, one primary action,
and a concise durable-handoff list. Safety, raw evidence, and approval context
are available in expandable detail.

## Implementation boundary

`app/lib/campaign-workflow.ts` is the public contract for the shared phase
order, inputs, output artifacts, safety boundary, and on-screen state. Its
verification input can distinguish unavailable verification, missing inputs,
and a handoff ready for review. Every downstream input is declared as an output
of its named source phase and covered by a graph-closure test.
`app/components/workflow-phase-page.tsx` renders the shared phase foundation
for Launch, Iterate, and Loop. The current Site intentionally passes unavailable
verification until a durable artifact adapter exists; it never infers readiness
from a browser draft or an unverified file.

The first post-Research slice is Launch preflight: a vendor-neutral
`launch-plan.json`, deterministic validation, a human-readable `launch-diff.md`,
and an immutable approval record. It remains dry-run only until the user
approves an exact external action.
