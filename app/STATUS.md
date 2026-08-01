# Negroni application — Status

Updated: 2026-07-31

Repository path: `app/`

## State

Version 0.9.0-beta.1 is the Negroni beta Sites workspace and implements the
application shell and Phase 1 interface on one route. The repository also now
ships a validated plugin manifest, onboarding skill, and five phase skills:

- a branded Home workspace with a focused Phase 1 tool board, factual research
  readiness, runner state, phase progression, and artifact handoffs;
- persistent navigation using Research, Create, Launch, Iterate, and Loop;
- focused Phase 1 navigation for Create Brand and Ad Spy;
- Research tab with permanent owner-scoped brand files and offer-scoped
  research packages;
- interactive, versioned Markdown seeds with direct editing, permanent notes,
  recoverable revision history, optional AI proposals, and explicit Phase 2
  approval;
- complete intake for profession, job title, company, public website/profile,
  industry/niche, known competitors, location/market, lead offer/service, and
  optional target age range; no customer-name field;
- one canonical internal five-prompt sequence, hidden from the primary form;
- one optional Create customer competitor database control, minimal run
  status, verified Drive folder and Doc links, optional Sheet, and Markdown;
- a compact Competitor Ads Intelligence module with refresh health, watched
  competitors, active/new/changed ads, creative-family counts, coverage
  limitations, and access-controlled artifact links;
- Library and Brands under Tools; Library defaults to a real brand/offer and
  filters Drive-backed outputs by offer, asset type, platform, status, and date,
  with run and offer provenance on every result; Draper remains a plugin-only
  conversational control plane over an owner-, workspace-, and brand-scoped
  Learning Core;
- an authoritative local SQLite catalog, immutable learning versions, FTS5,
  rebuildable non-authoritative vectors, content-addressed media, and guarded
  Obsidian-compatible Markdown projections;
- Integrations under Tools for Codex CLI, Claude Code, Gemini API key or OAuth,
  Kie.ai, Apify, and Google Drive; Settings retains appearance and Safety/YOLO;
- owner-scoped Gemini, Kie.ai, and Apify credentials encrypted with AES-GCM in
  D1 using a server-only runtime key; verification is non-generative and
  plaintext credentials never return to the browser;
- an optional developer `@negroni/local` package with the `negroni start` and
  `negroni doctor` commands; and
- a loopback-only credential bridge that keeps pasted API keys in process
  memory only, supports scoped 1Password environment injection, and checks
  native CLI authentication without copying OAuth tokens.

The visual system uses compact Inter typography, a flat dark navy workspace,
fixed left navigation, two-column tool cards, and one state-derived next-action
panel on Home. Negroni red is limited to active navigation, primary actions,
progress, and glass highlights. The same hierarchy collapses to one readable
column on mobile.

Brand files and offer records use the site D1 binding and contain the complete
non-secret intake, owner identity, timestamps, Markdown seed revisions, review
messages, and approval fingerprints. Duplicate offer combinations are reused
instead of creating another record. Provider secrets stay outside D1 and the
browser; the server forwards them only to an owner-scoped credential broker.

The current draft and approved Phase 2 seed are separate. Editing after
approval creates `draft_changes`; it does not silently change the approved
revision or ads already tied to an older revision. AI output remains proposed
until explicitly applied.

Contract `4.0` requires the exact validated prompt source, five prompts in
order, one receipt per prompt, receipts for all five durable Research artifacts,
one verified Google Doc, and one matching Markdown report. Competitor database
creation is the only user-facing optional action; when selected it requires a
verified Sheet or explicit limitation. When declined, database collection is
`not_requested` and does not block the core package. Monitoring is not a second
user-facing choice and this flow installs no scheduler.

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
brokered standard Gemini Deep Research adapter. One approved run uses one
standard interaction for all five required prompts, validates section coverage
and URL citations, and keeps the API key inside the credential broker. Paid
execution is fail-closed behind an exact owner-scoped run-ID approval. The Site
now exposes authenticated, same-origin Gemini connection routes and separate
approve/start routes; a direct browser POST to the legacy run endpoint fails
closed. Saving or checking a key cannot start research. No real Gemini key was
changed and no paid Deep Research request was executed during this
implementation.

The local launcher now starts the Site, owner-scoped runner, and credential
broker as one loopback-only stack. A deterministic no-paid-model research
upstream has exercised the full five-step run through real private Google Drive
filing, including a verified native Google Doc, Markdown file, optional native
Sheet, and `Negroni / Brand / Offer` folder link. The checked competitor-
database run completed honestly as `partial` because official public-ad
collection was not authorized. Temporary validation files were moved to Drive
trash after readback; the permanent `Negroni` root remains.

The latest verified Drive receipt now persists on the exact owner-scoped offer
with its immutable intake basis. A later brand or offer edit preserves that
receipt and marks it as needing refresh. Stable brand and offer IDs travel only
over the authenticated server-to-runner boundary and keep Drive folders attached
to the same permanent records even when their display names change.
A second live local rehearsal completed with the database option declined,
returned `complete`, survived a profile reload with the same run and folder
link, and then removed the synthetic profile and moved its exact validation
brand folder to Drive trash. No paid model was called.

These checks prove the local execution and Drive boundaries, not a paid Gemini
run or a hosted deployment. Hosted research remains correctly **blocked** until
the Sites runtime has the private runner and credential-broker bindings. No
production deployment, paid Deep Research request, official Meta collection,
scheduler, traffic, publishing, or ad-account mutation was performed.

The existing owner-restricted Site and project ID are preserved:
`https://negroni-campaign-studio.gpfeff.chatgpt.site`.

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
- Brand-and-offer endpoint and D1 schema: `app/api/profiles/route.ts`, `db/`, `drizzle/`
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
- Research runner and competitor-archive contract: `docs/runner-contract.md`
- Contract tests: `tests/`
- Responsive QA: `qa/visual-qa-report.json`, `qa/screenshots/`
- Plugin manifest and portable workflows: `../.codex-plugin/`, `../skills/`

## Checks

- `npm run validate`: passed
- TypeScript and scoped ESLint: passed
- Plugin contract tests: 4/4 passed
- Public capture-boundary tests: 6/6 passed
- Application contract/security tests: 145/145 passed
- Vinext production build: passed
- Separate web application production build: passed
- Install smoke test: global package, local app, and seven-provider Integrations API passed
- Visual QA: Home, Research, Library, Brands, Brand detail, Integrations, and
  Settings passed at desktop and mobile sizes, 151/151 checks
- Accessibility: zero serious or critical Axe violations across all tested states
- Browser runtime: no unexpected console errors or horizontal overflow

## Blockers

Configure these server-side values with their real services:

- `LEAD_INTELLIGENCE_RUNNER_URL`
- `LEAD_INTELLIGENCE_RUNNER_TOKEN`
- `LEAD_INTELLIGENCE_REVIEW_URL`
- `CREDENTIAL_BROKER_URL`
- `CREDENTIAL_BROKER_TOKEN`

The hosted runner must invoke the implemented Meta Ads Intelligence adapter,
expose access-controlled report URLs, and provide an authorized collection
route. The hosted broker must implement the seven-provider contract, including
Apify, an encrypted Gemini `SecretStore`, the non-generative verifier, and the
final owner-scoped Google OAuth/Drive boundary. The local bridge already has a
verified Google Drive path through Application Default Credentials.

## Remaining risks

- The five-step runner and checkpoint/replay behavior are locally verified with
  a deterministic no-paid-model upstream; no real paid Gemini run has been
  approved or executed.
- Live official Meta API collection cannot be verified before profile
  authorization and credentials exist.
- No Foreplay, Firecrawl, BrowserOS collection, or Cloudflare scraper is
  selected for competitor collection.
- No Negroni scheduler owner is configured; the adapter intentionally did not
  create one. The existing `pay-per-call` Hermes owner was not changed.
- Private Google Drive folder, Doc, Markdown, optional Sheet, formula safety,
  readback parity, and idempotent replay are locally verified. Hosted Google
  OAuth and production filing remain unverified.
- Learning Core warehouse measurements and Draper's end-to-end answer are
  fixture-only. PostgreSQL, live warehouse ingestion, continuous learning,
  hosted persistence, and ad-account mutation are not implemented.
- The Learning Core currently uses Node's experimental built-in SQLite API;
  the storage contract isolates that implementation for a later adapter.
- The hosted Site credential vault is implemented; live provider verification
  still depends on each provider accepting the submitted user credential.
- Local pasted Kie.ai, Gemini, and Apify credentials are process-memory only;
  persistent local injection requires a scoped 1Password Developer Environment.
  No real key was entered and no paid generation request was made.
- D1 record persistence needs one production authenticated save/reload check
  after the deployed binding is provisioned.
- Edited seed revisions do not yet regenerate the Google Doc or Markdown
  output; those remain run snapshots.
