# PHASE 1: RESEARCH — Status

Updated: 2026-07-29

Repository path: `phase-1-research/`

## State

The tool was moved from its earlier standalone workspace into Negroni and
renamed **PHASE 1: RESEARCH**. Package identity, UI metadata, documentation, and
the repository entry points use the phase name.

The overbuilt workbench has been reduced to one responsive intake → research → deliverables page. The dashboard, saved projects, sidebar, seven-view navigation, ten-step wizard, evidence/lane UI, synthetic fixture, ten-document matrix, browser storage, and localhost companion are retired.

The UI now reflects the Step #2 research shape: client, market awareness, B2B
lead buyer, B2C customer, competitors, and master synthesis. Contract `3.0`
adds complete-or-limited coverage receipts and a default-on, project-specific
nightly Meta Ads Intelligence request. A complete result requires an active
monitor receipt; usable research with an explicit monitoring or research
limitation is `partial`.

Live research remains correctly **blocked** because the Sites runtime does not
currently have a configured secure canonical-skill runner or verified Google
Workspace connector. The runner-side Meta Ads Intelligence adapter and single
scheduler owner are also not configured. No fake run, schedule, watch count,
Google ID, output URL, publication state, research finding, or parity state is
present.

The rebuilt source is published to the existing owner-restricted Site at
`https://lead-intelligence-workbench.g-pfeffer.chatgpt.site`. The persisted
project ID and prior deployment history were preserved; no duplicate site was
created. The hosted environment has no runner variables, so the production UI
correctly remains blocked rather than simulating research.

## Artifacts

- Thin client: `app/page.tsx`, `components/intelligence-client.tsx`, `app/globals.css`
- Environment-neutral server boundary: `app/api/run/route.ts`
- Intake/output contracts and validation: `lib/intelligence/`
- Secure runner and monitoring contract: `docs/runner-contract.md`
- Preserved secret and example-leak scanners: `lib/contracts/`
- Acceptance tests: `tests/intelligence-contract.test.ts`
- Product/runtime/design documentation: `README.md`, `BRIEF.md`, `docs/`
- Visual QA report and current screenshots: `qa/visual-qa-report.json`, `qa/screenshots/thin-client-*.png`

## Checks

- `npm run validate`: passed — TypeScript, scoped ESLint, 12/12 tests, and Vinext production build
- Clean build: passed after stale pre-move Vinext font state was removed; generated assets contain no former Mac workspace path
- `npm run qa:visual`: passed at 1440×1000 and 390×844
- Visual QA: exactly three output cards, nightly-monitor receipt copy, progressive details, visible blocker, disabled unavailable execution, no horizontal overflow, no unexpected console errors, and no serious/critical Axe violations
- Stale runtime scan: no localhost companion, synthetic fixture, or old workbench implementation remains in active app, component, library, or test files

## Blocker

Configure both server-side values and their real backing services:

- `LEAD_INTELLIGENCE_RUNNER_URL` — a secure runner that invokes the canonical `lead-generation-ads-discovery-intelligence` skill
- `LEAD_INTELLIGENCE_RUNNER_TOKEN` — the server-only credential for that runner

The runner must also have a native Google Workspace creation/readback route and
an authorized Meta Ads Intelligence adapter that
creates project-isolated watchlists, reuses one scheduler owner, updates the
same competitor Sheet nightly, and returns the strict `3.0` receipt. Until then,
the page remains honest and non-executable.

## Remaining risks

- A real end-to-end run cannot be verified before the secure runner and Google connector exist.
- A nightly run cannot be verified before the runner-side Meta Ads Intelligence
  adapter, authorized collection route, and scheduler owner exist.
- The response contract attests to competitor-row evidence and Doc/Markdown parity, but those validations remain runner responsibilities and need integration tests against the eventual service.
- File attachments are request-forwarded and not persisted; the eventual runner must enforce its own file-size, malware, and content-safety limits.
- Incomplete dependency and pre-move build-cache directories are parked as ignored hidden/generated folders; active dependencies resolve from the external cache and the clean post-move build does not use stale paths.

## Next action

Build the secure environment-neutral runner, Google Workspace connector, and
Meta Ads Intelligence adapter; configure the two server-side values; then
execute one bounded project and verify the Doc, Sheet, Markdown parity,
research coverage, competitor rows, watchlist, schedule receipt, citations,
access, and limitations end to end.
