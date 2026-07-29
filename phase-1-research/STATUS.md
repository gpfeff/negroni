# PHASE 1: RESEARCH — Status

Updated: 2026-07-29

Repository path: `phase-1-research/`

## State

Version 0.7 implements the Negroni application shell and Phase 1 interface on
one route:

- a branded Home workspace with a focused Phase 1 tool board, factual research
  readiness, runner state, phase progression, and artifact handoffs;
- persistent navigation using Research, Create, Launch, Iterate, and Loop;
- nested Phase 1 navigation for Run Research, Client, Customer, Competitors,
  Competitor Ads, and Review & Approve;
- Research tab with owner-scoped saved research sets;
- interactive, versioned Markdown seeds with direct editing, permanent notes,
  recoverable revision history, optional AI proposals, and explicit Phase 2
  approval;
- four required inputs: lead offer or service, industry, country or region,
  and target age range;
- the fixed five-prompt sequence from the supplied Google Doc;
- run status, prompt limitations, nightly competitor-monitor receipt, and
  exactly three output actions;
- a compact Competitor Ads Intelligence module with refresh health, watched
  competitors, active/new/changed ads, creative-family counts, coverage
  limitations, and access-controlled artifact links;
- Settings tab for Google Drive OAuth/automatic filing, Codex OAuth, and a
  Gemini API key.

Saved sets use the site D1 binding and contain the four research values, owner
identity, timestamps, Markdown seed revisions, review messages, and approval
fingerprints. Duplicate combinations are reused instead of creating another
record. Provider secrets stay outside D1 and the browser; the server forwards
them only to an owner-scoped credential broker.

The current draft and approved Phase 2 seed are separate. Editing after
approval creates `draft_changes`; it does not silently change the approved
revision or ads already tied to an older revision. AI output remains proposed
until explicitly applied.

Contract `4.0` requires exact source document
`1lbwCUUeJnqung5JZJwJGVq-20u3UOgMqaaqMYUcrb9o`, the five prompts in order,
one receipt per prompt, receipts for all five durable Research artifacts, one
verified Google Doc, one matching Markdown report, a competitor archive action,
and an active-or-blocked monitoring receipt. Google Sheet projection is
optional; an access-controlled local report remains available when it is not
configured.

The server-only Meta Ads Intelligence adapter now:

- derives one isolated profile per research-set ID;
- rejects cross-profile snapshots and local-path browser links;
- reuses the engine CLI rather than its SQLite schema;
- supports normalized imports and the authorized official API adapter;
- persists missing inputs as `skipped` and missing official API authorization
  as `blocked`;
- rebuilds families, writes local Markdown/CSV reports, and returns a
  deterministic delta for one immutable daily run;
- maps Meta evidence into `research-brief.md`, `evidence-index.json`,
  `opportunity-map.json`, `creative-brief.json`, and
  `research-receipt.json`;
- never installs a scheduler.

Live research remains correctly **blocked** because the Sites runtime has no
secure research runner variables. Provider connections remain correctly
**blocked** because it has no credential-broker variables. No fake run, Google
file, provider connection, schedule, watch count, finding, or parity state is
present.

The existing owner-restricted Site and project ID are preserved:
`https://lead-intelligence-workbench.g-pfeffer.chatgpt.site`.

## Artifacts

- Interface: `components/intelligence-client.tsx`, `app/globals.css`
- Seed review: `components/research-review.tsx`, `app/api/review/route.ts`,
  `lib/research-seed.ts`
- Research endpoint: `app/api/run/route.ts`
- Saved-set endpoint and D1 schema: `app/api/profiles/route.ts`, `db/`, `drizzle/`
- Provider endpoint and safe response parsing: `app/api/settings/route.ts`,
  `lib/provider-settings.ts`
- Intake/result contracts: `lib/intelligence/`
- Meta Ads adapter, profile boundary, artifact mapper, and snapshot validation:
  `lib/meta-ads/`
- Runner and monitoring contract: `docs/runner-contract.md`
- Contract tests: `tests/`
- Responsive QA: `qa/visual-qa-report.json`, `qa/screenshots/`

## Checks

- `npm run validate`: passed
- TypeScript and scoped ESLint: passed
- Contract/security tests: 29/29 passed
- Vinext production build: passed
- Visual QA: passed for Home, Research, and Settings at 1440×1000 and 390×844
- Accessibility: no serious or critical Axe violations
- Browser runtime: no unexpected console errors or horizontal overflow

## Blockers

Configure these server-side values with their real services:

- `LEAD_INTELLIGENCE_RUNNER_URL`
- `LEAD_INTELLIGENCE_RUNNER_TOKEN`
- `LEAD_INTELLIGENCE_REVIEW_URL`
- `CREDENTIAL_BROKER_URL`
- `CREDENTIAL_BROKER_TOKEN`

The runner must invoke the implemented Meta Ads Intelligence adapter, expose
access-controlled report URLs, and provide an authorized collection route.
The broker must implement
owner-scoped Codex OAuth, Gemini secret storage, and Google OAuth with
`drive.file` and automatic filing in `Negroni Research`.

## Remaining risks

- A real five-prompt run cannot be verified before the runner exists.
- Live official Meta API collection cannot be verified before profile
  authorization and credentials exist.
- No Negroni scheduler owner is configured; the adapter intentionally did not
  create one. The existing `pay-per-call` Hermes owner was not changed.
- Google projection remains unverified and optional; no Google action was
  performed by this integration.
- Broker connection flows need integration tests against the eventual service.
- D1 record persistence needs one production authenticated save/reload check
  after the deployed binding is provisioned.
- Edited seed revisions do not yet regenerate the Google Doc or Markdown
  output; those remain run snapshots.
