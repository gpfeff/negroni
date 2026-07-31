# Negroni application — Status

Updated: 2026-07-30

Repository path: `app/`

## State

Version 0.9.0-beta.1 is the Negroni beta Sites workspace and implements the
application shell and Phase 1 interface on one route. The repository also now
ships a validated plugin manifest, onboarding skill, and five phase skills:

- a branded Home workspace with a focused Phase 1 tool board, factual research
  readiness, runner state, phase progression, and artifact handoffs;
- persistent navigation using Research, Create, Launch, Iterate, and Loop;
- nested Phase 1 navigation for Run Research, Client, Customer, Competitors,
  Competitor Ads, and Review & Approve;
- Research tab with owner-scoped saved research sets;
- interactive, versioned Markdown seeds with direct editing, permanent notes,
  recoverable revision history, optional AI proposals, and explicit Phase 2
  approval;
- required customer profile: client/customer name, profession/job title, company,
  public website/profile URL, service/offer purchased, competitor used,
  industry/niche, and location/market served; plus lead offer/service and
  target age range for research scope;
- the fixed five-prompt sequence from the supplied Google Doc;
- run status, prompt limitations, nightly competitor-monitor receipt, and
  exactly three output actions;
- a compact Competitor Ads Intelligence module with refresh health, watched
  competitors, active/new/changed ads, creative-family counts, coverage
  limitations, and access-controlled artifact links;
- Draper under Tools as the conversational control plane over an owner-,
  workspace-, and brand-scoped Learning Core;
- an authoritative local SQLite catalog, immutable learning versions, FTS5,
  rebuildable non-authoritative vectors, content-addressed media, and guarded
  Obsidian-compatible Markdown projections;
- Settings tab for Codex CLI, Claude Code, Gemini API key or OAuth, Kie.ai,
  Google Drive, appearance, and Safety/YOLO mode;
- an optional developer `@negroni/local` package with the `negroni start` and
  `negroni doctor` commands; and
- a loopback-only credential bridge that keeps API keys under `~/.negroni`
  with owner-only permissions and checks native CLI authentication without
  copying OAuth tokens.

The visual system now follows the supplied AI Ad Lab references: compact Inter
typography, dark navy dotted workspace, fixed left navigation, two-column
tool cards, and a persistent `Up next` rail. Negroni red is limited to active
navigation, primary actions, progress, and glass highlights. The same hierarchy
collapses to one readable column on mobile.

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
- preserves experimental third-party adapter source for review without exposing
  it through the public CLI or MCP; the selected live plan is official Meta
  only;
- persists missing inputs as `skipped` and missing official API authorization
  as `blocked`;
- rebuilds families, writes local Markdown/CSV reports, and returns a
  deterministic delta for one immutable daily run;
- maps Meta evidence into `research-brief.md`, `evidence-index.json`,
  `opportunity-map.json`, `creative-brief.json`, and
  `research-receipt.json`;
- never installs a scheduler.

The checked-in tests remain sanitized and offline. Engine-backed runtime tests
require the sibling `meta-ads-intelligence` checkout and are explicitly skipped
when it is absent; all engine-independent contract tests still run.

The local Research runner now also has a provider-neutral sequence seam and a
brokered Gemini Deep Research Max adapter. One approved run uses one Max
interaction for all five required prompts, validates section coverage and URL
citations, and keeps the API key inside the credential broker. Paid execution
is fail-closed behind an exact run-ID approval. No real Gemini key was changed
and no paid Deep Research request was executed during this implementation.

Live research remains correctly **blocked** because the Sites runtime has no
secure research runner variables. Hosted provider connections remain correctly
**blocked** because it has no credential-broker variables. The installed
edition verifies Codex as connected on this machine; Claude Code is installed
but logged out, and Gemini OAuth is blocked until `gcloud` is installed. No
fake run, Google file, provider connection, schedule, watch count, finding, or
parity state is present.

The existing owner-restricted Site and project ID are preserved:
`https://lead-intelligence-workbench.g-pfeffer.chatgpt.site`.

The general plugin is skill-backed and exposes seven local, fail-closed MCP
tools. Three cover Learning Core status, bounded Draper queries, and exact
local decision records; four cover capability and competitor-research
boundaries. These are local plugin tools, not a hosted provider deployment.
The Site keeps private machine-local databases and vault notes out of the
browser and continues to report unavailable hosted capabilities as blocked.

## Artifacts

- Interface: `components/intelligence-client.tsx`, `app/globals.css`
- Seed review: `components/research-review.tsx`, `app/api/review/route.ts`,
  `lib/research-seed.ts`
- Research endpoint: `app/api/run/route.ts`
- Saved-set endpoint and D1 schema: `app/api/profiles/route.ts`, `db/`, `drizzle/`
- Provider endpoint and safe response parsing: `app/api/settings/route.ts`,
  `lib/provider-settings.ts`
- Local launcher and credential bridge: `bin/negroni.mjs`,
  `scripts/local-broker.mjs`, `scripts/local-doctor.mjs`
- Safety/YOLO boundary: `lib/operating-policy.ts`
- Intake/result contracts: `lib/intelligence/`
- Meta Ads adapter, profile boundary, artifact mapper, and snapshot validation:
  `lib/meta-ads/`
- Draper, Learning Core contracts, SQLite storage, FTS5, vectors, vault, media,
  warehouse fixture, migration, and fixture: `lib/learning-core/`,
  `bin/draper.ts`, `migrations/learning-core/`, `fixtures/learning-core/`
- Cache-portable MCP boundary: `bin/negroni-mcp.mjs`
- Runner and monitoring contract: `docs/runner-contract.md`
- Contract tests: `tests/`
- Responsive QA: `qa/visual-qa-report.json`, `qa/screenshots/`
- Plugin manifest and portable workflows: `../.codex-plugin/`, `../skills/`

## Checks

- `npm run validate`: passed
- TypeScript and scoped ESLint: passed
- Plugin contract tests: 4/4 passed
- Application contract/security tests: 111/111 passed
- Vinext production build: passed
- Install smoke test: global package, local app, and six-provider Settings API passed
- Visual QA: Home, Research, Draper, and Settings passed at desktop and mobile
  sizes, 108/108 checks
- Accessibility: zero serious or critical Axe violations across all eight states
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
The hosted broker must implement the six-provider contract. The local bridge
still needs a Google OAuth client ID before Google Drive can connect.

## Remaining risks

- A real five-prompt run cannot be verified before the runner exists.
- Live official Meta API collection cannot be verified before profile
  authorization and credentials exist.
- No Foreplay, Firecrawl, BrowserOS collection, or Cloudflare scraper is
  selected for competitor collection.
- No Negroni scheduler owner is configured; the adapter intentionally did not
  create one. The existing `pay-per-call` Hermes owner was not changed.
- Google projection remains unverified and optional; no Google action was
  performed by this integration.
- Learning Core warehouse measurements and Draper's end-to-end answer are
  fixture-only. PostgreSQL, live warehouse ingestion, continuous learning,
  hosted persistence, and ad-account mutation are not implemented.
- The Learning Core currently uses Node's experimental built-in SQLite API;
  the storage contract isolates that implementation for a later adapter.
- Hosted broker connection flows need integration tests against the eventual service.
- The local Kie.ai and Gemini key vault is implemented, but no real key was
  entered and no paid generation request was made.
- D1 record persistence needs one production authenticated save/reload check
  after the deployed binding is provisioned.
- Edited seed revisions do not yet regenerate the Google Doc or Markdown
  output; those remain run snapshots.
