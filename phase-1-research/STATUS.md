# PHASE 1: RESEARCH — Status

Updated: 2026-07-29

Repository path: `phase-1-research/`

## State

Version 0.4 implements the recommended Phase 1 interface on one route:

- Research tab with owner-scoped saved research sets;
- four required inputs: lead offer or service, industry, country or region,
  and target age range;
- the fixed five-prompt sequence from the supplied Google Doc;
- run status, prompt limitations, nightly competitor-monitor receipt, and
  exactly three output actions;
- Settings tab for Google Drive OAuth/automatic filing, Codex OAuth, and a
  Gemini API key.

Saved sets use the site D1 binding and contain only the four research values,
owner identity, and timestamps. Duplicate combinations are reused instead of
creating another record. Provider secrets stay outside D1 and the browser; the
server forwards them only to an owner-scoped credential broker.

Contract `4.0` requires exact source document
`1lbwCUUeJnqung5JZJwJGVq-20u3UOgMqaaqMYUcrb9o`, the five prompts in order,
one receipt per prompt, exactly one verified Google Doc, one matching Markdown
report, one verified competitor-ad Google Sheet, and an active-or-blocked
nightly monitoring receipt.

Live research remains correctly **blocked** because the Sites runtime has no
secure research runner variables. Provider connections remain correctly
**blocked** because it has no credential-broker variables. No fake run, Google
file, provider connection, schedule, watch count, finding, or parity state is
present.

The existing owner-restricted Site and project ID are preserved:
`https://lead-intelligence-workbench.g-pfeffer.chatgpt.site`.

## Artifacts

- Interface: `components/intelligence-client.tsx`, `app/globals.css`
- Research endpoint: `app/api/run/route.ts`
- Saved-set endpoint and D1 schema: `app/api/profiles/route.ts`, `db/`, `drizzle/`
- Provider endpoint and safe response parsing: `app/api/settings/route.ts`,
  `lib/provider-settings.ts`
- Intake/result contracts: `lib/intelligence/`
- Runner and monitoring contract: `docs/runner-contract.md`
- Contract tests: `tests/`
- Responsive QA: `qa/visual-qa-report.json`, `qa/screenshots/`

## Checks

- `npm run validate`: passed
- TypeScript and scoped ESLint: passed
- Contract/security tests: 24/24 passed
- Vinext production build: passed
- Visual QA: passed for Research and Settings at 1440×1000 and 390×844
- Accessibility: no serious or critical Axe violations
- Browser runtime: no unexpected console errors or horizontal overflow

## Blockers

Configure these server-side values with their real services:

- `LEAD_INTELLIGENCE_RUNNER_URL`
- `LEAD_INTELLIGENCE_RUNNER_TOKEN`
- `CREDENTIAL_BROKER_URL`
- `CREDENTIAL_BROKER_TOKEN`

The runner must have native Google creation/readback plus the authorized Meta
Ads Intelligence adapter and scheduler owner. The broker must implement
owner-scoped Codex OAuth, Gemini secret storage, and Google OAuth with
`drive.file` and automatic filing in `Negroni Research`.

## Remaining risks

- A real five-prompt run and the three outputs cannot be verified before the
  runner and Google connection exist.
- The nightly pull cannot be verified before the Meta adapter and scheduler are
  configured.
- Broker connection flows need integration tests against the eventual service.
- D1 record persistence needs one production authenticated save/reload check
  after the deployed binding is provisioned.
