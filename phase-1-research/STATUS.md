# PHASE 1: RESEARCH — Status

Updated: 2026-07-28

Repository path: `phase-1-research/`

## State

The tool was moved from its earlier standalone workspace into Negroni and
renamed **PHASE 1: RESEARCH**. Package identity, UI metadata, documentation, and
the repository entry points use the phase name.

The overbuilt workbench has been reduced to one responsive intake → research → deliverables page. The dashboard, saved projects, sidebar, seven-view navigation, ten-step wizard, evidence/lane UI, synthetic fixture, ten-document matrix, browser storage, and localhost companion are retired.

The UI and response contract are complete and validated. Live research is correctly **blocked** because the Sites runtime does not currently have a configured secure canonical-skill runner or verified Google Workspace connector. No fake run, Google ID, output URL, publication state, research finding, or parity state is present.

Publishing the rebuilt source is also blocked: the project ID persisted in `.openai/hosting.json` returns `Sites project not found` to the current connector. A duplicate site was not created. The prior `lead-intelligence-workbench.g-pfeffer.chatgpt.site` deployment remains stale and does not contain this reduction.

## Artifacts

- Thin client: `app/page.tsx`, `components/intelligence-client.tsx`, `app/globals.css`
- Environment-neutral server boundary: `app/api/run/route.ts`
- Intake/output contracts and validation: `lib/intelligence/`
- Preserved secret and example-leak scanners: `lib/contracts/`
- Acceptance tests: `tests/intelligence-contract.test.ts`
- Product/runtime/design documentation: `README.md`, `BRIEF.md`, `docs/`
- Visual QA report and current screenshots: `qa/visual-qa-report.json`, `qa/screenshots/thin-client-*.png`

## Checks

- `npm run validate`: passed — TypeScript, scoped ESLint, 6/6 tests, Vinext production build
- `npm run qa:visual`: passed at 1440×1000 and 390×844
- Clean post-move build: passed with regenerated font and asset paths
- Visual QA: exactly three output cards, progressive details, visible blocker, disabled unavailable execution, no horizontal overflow, no unexpected console errors, and no serious/critical Axe violations
- Stale runtime scan: no localhost companion, synthetic fixture, or old workbench implementation remains in active app, component, library, or test files

## Blocker

Configure both server-side values and their real backing services:

- `LEAD_INTELLIGENCE_RUNNER_URL` — a secure runner that invokes the canonical `lead-generation-ads-discovery-intelligence` skill
- `LEAD_INTELLIGENCE_RUNNER_TOKEN` — the server-only credential for that runner

The runner must also have a native Google Workspace creation/readback route and return the strict v2 result contract. Until then, the page remains honest and non-executable.

For hosting, restore current-connector access to the persisted Sites project ID. Do not create a replacement project unless the original is intentionally retired and the hosting manifest is migrated.

## Remaining risks

- A real end-to-end run cannot be verified before the secure runner and Google connector exist.
- The response contract attests to competitor-row evidence and Doc/Markdown parity, but those validations remain runner responsibilities and need integration tests against the eventual service.
- File attachments are request-forwarded and not persisted; the eventual runner must enforce its own file-size, malware, and content-safety limits.
- Incomplete dependency and pre-move build-cache directories are parked as ignored hidden/generated folders; active dependencies resolve from the external cache and the clean post-move build does not use stale paths.

## Next action

Provide or build the secure environment-neutral runner and Google Workspace connector, configure the two server-side values, then execute one bounded real project and verify the Doc, Sheet, Markdown parity, competitor rows, citations, access, and limitations end to end.
