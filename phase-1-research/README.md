# Negroni application · Phase 1 Research

The deployed application opens on a B2B SaaS workspace home with persistent
navigation for Research, Create, Launch, Iterate, and Loop. Home shows campaign
state, agent readiness, the five-phase artifact pipeline, and the next honest
action. Research is the first executable section; later phases remain visibly
planned.

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
- Industry
- Country or region
- Target age range

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

Settings provides:

- Codex OAuth
- Gemini API key
- Google Workspace OAuth with the minimum `drive.file` scope

OAuth and API-key material must be stored only by a secure server-side
credential broker. The Gemini key is sent directly to that broker and cleared
from the form. Negroni does not persist secret values in the browser, site
database, repository, logs, or research payload.

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
