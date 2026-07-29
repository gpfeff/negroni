# Status

Updated: 2026-07-28

## State

The narrow MVP is implemented and validated. The real executor is Mac-local;
the hosted build contains only the labeled synthetic demonstration. An
owner-only Sites preview is deployed at
`https://lead-intelligence-workbench.g-pfeffer.chatgpt.site`.

## Artifacts

- Product decision: `docs/product-decision.md`
- Architecture/runtime boundary: `docs/architecture.md`
- Design system: `docs/design-system.md`
- Acceptance contract: `docs/acceptance-tests.md`
- Web app: `app/`, `components/`, `lib/`
- Local Codex adapter: `server/`
- Neutral synthetic fixture: `data/fixtures/synthetic-community-workshop.json`
- Automated tests: `tests/`
- Visual QA report and screenshots: `qa/`
- Social card: `public/og.png`

## Checks

- `npm run validate`: passed — 28/28 tests, TypeScript, ESLint, Vinext build
- `npm audit`: passed — 0 known production or development vulnerabilities
- `npm run qa:visual`: passed at 1440×1000 and 390×844; no horizontal
  overflow, unexpected console errors, or serious/critical Axe violations
- Mac real-adapter health: passed from the canonical Mac path; Codex App Server
  activated the scoped profile and resolved the exact canonical skill
- Sites access: verified `custom`, one owner, no groups
- Sites version 1: deployed successfully from commit
  `25330e1bb7c93e7858680a38c688be0bc4b3b507`

## Blockers

None for local fixture-backed MVP review. Native Google Docs publication and
local-file content ingestion are intentionally outside this vertical slice.

## Next action

Run one bounded non-synthetic project through the Mac-local executor, review its
evidence and lane states, and use that result to decide whether local-file
content ingestion is the next vertical slice.

## Remaining risks

- Codex App Server and named permission profiles are experimental surfaces.
- The real adapter accepts public URL references but local file contents remain
  metadata-only.
- Browser local storage has no run history or cross-device synchronization.
- Native Google Docs creation, readback, access, and parity are not implemented;
  `document-manifest.json` correctly does not exist.
