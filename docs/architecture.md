# Architecture

## Separation of concerns

| Layer | Owns |
|---|---|
| Shared skill | Research method, evidence rules, platform method, two-sided system, numbered deliverable contract |
| Local runtime | Skill discovery, bounded Codex turn, tools, structured output, validation, run metadata |
| Web app | Guided intake, saved projects, source metadata, preflight, lane/evidence/output review |
| Plugin | Optional later packaging; not part of the MVP |

## Information architecture

1. Projects
2. Intake
3. Sources
4. Preflight
5. Run
6. Evidence
7. Deliverables

The buyer system, consumer system, and lead-product bridge remain distinct
through intake, evidence, findings, and output review.

## State model

Project states are `draft`, `ready`, `researching`, `needs_review`, `partial`,
`complete`, and `failed`. Eleven lanes have independent state and blockers.
Editing an intake or source clears the prior MVP run instead of presenting stale
evidence as current.

The canonical intake plus app-owned `field_states`, `raw_answers`, and source
manifest form the input contract. `run-manifest.json` is the app-owned runtime
contract. It does not replace the canonical evidence, capture, or
`document-manifest.json` contracts.

## Real adapter

The browser calls `127.0.0.1:4317`; the companion spawns `codex app-server` over
stdio. App Server never listens on a browser-accessible or public socket.

The companion:

- resolves the exact shared skill with `skills/list`;
- starts Codex with a strict named permission profile;
- grants read-only access only to the project and skill runtime roots;
- enables network access for bounded research;
- uses `approvalPolicy: never`;
- rejects every non-empty external-action allowlist;
- passes the skill as an explicit skill input;
- requires structured output and validates lane, evidence, finding, artifact,
  state, and secret invariants;
- sanitizes the inherited process environment.

Runtime state is written outside synced Documents under the user application
state directory. The bounded MVP does not write project artifacts or publish
Google Docs during the research turn.

## Fixture adapter

The deterministic fixture is restricted to one immutable synthetic project ID
and exact synthetic intake. It produces two representative artifacts, synthetic
evidence records, explicit blockers, and ten delivery-contract rows. It cannot
run against copied or edited projects and is never a fallback for a failed real
run.

## Hosted preview

Hosted code cannot call localhost, so capability detection reports the real
adapter unavailable. Only the visibly labeled synthetic project can execute.
Project data remains in that browser's local storage.

## Residual seams

- A later source-ingestion adapter can make authorized local file contents
  available; this MVP stores metadata only.
- Native Google Docs publication remains a separate connector-backed lane with
  readback and parity gates.
- Server persistence, identity, teams, and run history can be added behind the
  existing contracts without moving the research method into UI code.
