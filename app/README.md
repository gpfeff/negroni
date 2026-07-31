# Negroni Sites workspace

This directory is the live workspace used by the Negroni plugin. It is not a
separate product users are expected to install or operate. The deployed Site
opens on a branded campaign workspace with persistent
navigation for Research, Create, Launch, Iterate, and Loop. Home presents the
Phase 1 tools as Run Research, Client, Customer, Competitors, Competitor Ads,
and Review & Approve. A factual guidance rail shows research readiness, the
next honest action, runner availability, and spend protection. Research is the
first executable section; later phases remain visibly planned.

Tools includes Library and Brands. Brands is the organizing parent for each
central brand file and its offers, research, ads, and creative. Library is the
brand-aware view of generated and collected assets. Draper remains available
through the installed plugin contracts but is intentionally not shown in the
Site navigation.

A focused Negroni interface for saving a reusable research set, running the
five approved research prompts in order, and producing five durable Research
artifacts:

1. `research-brief.md`
2. `evidence-index.json`
3. `opportunity-map.json`
4. `creative-brief.json`
5. `research-receipt.json`

The browser keeps three outward actions: the master Google Doc, matching
Markdown, and competitor archive. The archive opens a restricted Google Sheet
when configured, otherwise an access-controlled local report. SQLite remains
authoritative.

The Research tab asks only:

- Lead offer or service
- Client/customer name, profession or job title, and company
- Public website or profile URL
- Service or offer purchased and a competitor they use
- Industry/niche and location or market served
- Lead offer or service and target age range for the campaign research scope

The required profile and research-scope inputs feed three visible research streams: Client, Customer, and
Competitors. Competitor Ads remains one public-evidence source inside the
Competitors stream rather than a substitute for the full research method.

Each authenticated user can save, reopen, update, and delete combinations of
those inputs. Records are owner-scoped in the site database. The app never puts
provider credentials in those records.

## Review and Phase 2 seed

Research does not end at export. Every saved set has an interactive Markdown
seed workspace where the owner can:

- edit findings directly and save recoverable revisions;
- preserve disagreement or additional context as permanent notes;
- ask the configured review runner for a proposed rewrite;
- apply or reject an AI proposal explicitly;
- restore an earlier revision as a new draft; and
- approve one exact revision for Phase 2.

Approval pins both the revision ID and a SHA-256 fingerprint. Editing the
research later creates `draft_changes`; it does not silently replace the
approved Phase 2 seed or rewrite ads that were created from an older seed.
Reapprove the new revision when it should become authoritative. Google Doc,
Markdown, and competitor archive outputs remain snapshots of the original run
until a future export-sync integration regenerates them.

The five-prompt source is the approved Google Doc
`1lbwCUUeJnqung5JZJwJGVq-20u3UOgMqaaqMYUcrb9o` and the sequence is fixed:
Market Awareness, Competitor Research, Avatar/Psychographic Research, Master
Research, and Tone of Voice. The secure runner must return a receipt for every
prompt.

After competitor research verifies a Page-ID watchlist, the runner creates one
isolated Meta Ads Intelligence project profile. Its scheduler-neutral daily
operation supports normalized imports and an authorized official Meta API
adapter. Missing inputs are persisted as skipped; missing official API
authorization is persisted as blocked. The adapter never creates a scheduler.

## Settings and secrets

Settings provides the workspace-side connection and preference surface:

- one home for all preferences and connection setup
- Codex or ChatGPT plugin readiness
- Claude Code login
- Gemini API-key connection status, deliberate save/replace/disconnect actions,
  and an exact paid-run approval step
- Kie.ai API key for image and video generation
- Google Workspace OAuth with the minimum `drive.file` scope
- light, dark, or system appearance
- Safety or YOLO local operating mode

The sidebar stays navigation-only. Appearance, approval behavior, provider
status, and storage live in Settings. Local launcher setup remains an optional
developer fallback and must not be presented as the default product path.

The installed edition uses each agent CLI's native login. Negroni checks
`codex login status` or `claude auth status`; it never reads, copies, or
re-saves their OAuth credentials. Kie.ai and installed-edition Gemini keys are
sent directly to the local credential bridge, stored under `~/.negroni` with
owner-only file permissions, and cleared from the form. The hosted Site uses
`/api/connections/gemini` for owner-scoped connection metadata and deliberate
save, replace, and disconnect requests. Production fails closed until that
route is backed by an encrypted hosted secret store; the repository's in-memory
adapter is limited to tests and explicit non-production local previews. Negroni
does not persist secret values in the browser, site database, repository, logs,
or research payload.

Safety mode asks before every Git commit. YOLO mode may automate local drafts,
file writes, and commits. Neither mode can bypass explicit approval for
spending, budget changes, publishing creative, submitting forms, mutating an
ad account, or launching traffic.

Phase 1's configured Gemini research path defaults to standard Deep Research
(`deep-research-preview-04-2026`) for foundational research projects. It sends
all five required research prompts through one brokered interaction. Connecting
a key does not authorize a paid run; the runner also requires an exact
owner-scoped approved run ID. The browser first records that exact ID at
`/api/research/runs/:runId/approve`, then starts only the same approved ID at
`/api/research/runs/:runId/start`. Direct browser POSTs to `/api/run` fail
closed.

Google OAuth uses the web-server authorization-code flow with offline access.
The broker verifies OAuth state, stores refresh tokens securely, and creates or
reuses one app-owned `Negroni Research` folder. Each connected owner's Doc,
Sheet, and matching Markdown file are filed there automatically. The app
forwards only the authenticated owner identity to the broker and runner.

Configure these server-side values in the hosting environment:

- `LEAD_INTELLIGENCE_RUNNER_URL`
- `LEAD_INTELLIGENCE_RUNNER_TOKEN`
- `LEAD_INTELLIGENCE_REVIEW_URL`
- `CREDENTIAL_BROKER_URL`
- `CREDENTIAL_BROKER_TOKEN`

`LEAD_INTELLIGENCE_REVIEW_URL` may point to the same service as the main
runner, but it must implement the proposal-only review contract. Manual seed
editing, version history, notes, and approval do not require the review runner.

The runner additionally configures `META_ADS_INTELLIGENCE_CLI`,
`META_ADS_INTELLIGENCE_PYTHON`, and
`META_ADS_INTELLIGENCE_RUNTIME_HOME`; runtime state must stay outside
Documents.

Without the runner, research is visibly blocked.
Without the credential broker, Settings is visibly blocked. The app never
falls back to fixtures or invents Google IDs, output URLs, research findings,
or monitoring state.

The Gemini broker contract, deployment gate, and rollback boundary are in
[`docs/gemini-credential-broker.md`](docs/gemini-credential-broker.md).

The repository includes a deployable local runner boundary at
`bin/research-runner.ts`. It authenticates a server bearer token plus opaque
owner identity, accepts only the strict customer-profile and research-scope intake, fetches the approved
prompt source server-side, checkpoints the exact five-prompt sequence, calls
the stable competitor boundary, and writes immutable five-artifact receipts.
Its default provider set is intentionally blocked, so starting this process
does not create a live research capability. Deployment and provider wiring are
described in [`docs/research-runner-deployment.md`](docs/research-runner-deployment.md).

The installed plugin also provides a local, provider-neutral MCP. It wraps the
stable CLI for dry-run-default competitor execution and resume, plus sanitized
capability, Learning Core, Draper, decision, and artifact contracts. It does
not expose a generic command or SQL tool, raw stdout/stderr, credentials,
runtime paths, account mutation, publishing, or scheduler activation.

## Draper and Learning Core

The local Learning Core keeps the relational catalog and learning history in
authoritative SQLite, full-text retrieval in FTS5, optional rebuildable vector
entries, SHA-256 content-addressed media references, and an
Obsidian-compatible generated Markdown vault. The first warehouse adapter and
complete Draper flow are sanitized fixtures only. See
[`docs/draper-learning-core.md`](docs/draper-learning-core.md).

The connector follows Google's narrow-scope and server-side token guidance:
[Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
and
[OAuth for web-server apps](https://developers.google.com/identity/protocols/oauth2/web-server).

The exact runner and monitoring requirements are in
[`docs/runner-contract.md`](docs/runner-contract.md).

## Commands

```bash
npm install
npm run dev
npm run validate
npm run qa:visual
```

Dependencies are runtime state and should live outside the synced Documents
tree.

For contributor development and the optional self-hosted fallback, see
[`docs/LOCAL-AND-REMOTE-SETUP.md`](../docs/LOCAL-AND-REMOTE-SETUP.md).

From a checkout, `npm run dev:local` starts the same loopback app-and-bridge
pair as the installed launcher. Use it when developing the complete local
experience; `npm run dev` remains the UI-only contributor server.

## Optional local developer package

The local package supports development and self-hosted diagnostics. It is not
Negroni's primary distribution. Build it from a trusted checkout, then run it
from any directory:

```bash
package_dir="$(mktemp -d)"
npm pack --pack-destination "$package_dir"
npm install --global "$package_dir"/negroni-local-*.tgz
negroni doctor
negroni start
```

Open `http://127.0.0.1:3000`. The launcher starts the private loopback
credential bridge and the web interface together. Run `negroni doctor` to see
which local agent and Google logins are ready; unavailable or signed-out
providers are readiness findings, not a reason to publish credentials.

The package is local-only until an explicit npm publishing decision is made.
The launcher is a development runtime, not a production deployment service.

To only build a package without installing it:

```bash
package_dir="$(mktemp -d)"
npm pack --pack-destination "$package_dir"
```
