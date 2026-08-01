# Architecture

```text
Authenticated browser
  |
  +-- Research tab
  |     +-- permanent brand foundation + current offer intake
  |     +-- owner-scoped brands and offer packages -> D1
  |     +-- versioned Markdown seed review -> D1
  |     |     +-- direct edits and permanent notes
  |     |     +-- POST /api/review -> secure review runner
  |     |     |     +-- proposed revision only
  |     |     +-- explicit apply, reject, restore, and approve
  |     |     +-- approved revision ID + SHA-256 -> Phase 2
  |     +-- POST /api/research/runs/:runId/approve
  |     |     +-- exact owner, Standard model, scope, and cost disclosure
  |     +-- POST /api/research/runs/:runId/start -> secure runner
  |           +-- consumes the same owner-scoped approval exactly once
  |           +-- authenticated owner -> owner-isolated Drive connection
  |           +-- fixed five-prompt research sequence
  |           +-- public research tools
  |           +-- five durable Research artifacts
  |           +-- Doc and Markdown -> Negroni / Brand / Offer
  |           +-- verified Drive folder receipt -> Run Status, Brands, Library
  |           +-- optional requested competitor database -> restricted Sheet
  |           +-- optional Meta Ads Intelligence server adapter
  |                 +-- project-derived isolated profile
  |                 +-- SQLite-owned lifecycle/media/ratings
  |                 +-- scheduler-neutral daily refresh
  |                 +-- deterministic snapshot and daily delta
  |           +-- provider-neutral competitor runner
  |                 +-- stable nightly CLI and exit states
  |                 +-- Meta engine-owned isolated SQLite
  |                 +-- v2 public durability signal
  |                 +-- immutable receipts and resume checkpoint
  |                 +-- optional projection contract
  |           +-- strict result receipt
  |
  +-- Tools / Integrations
        +-- Codex OAuth --------+
        +-- Gemini API key -----+-> /api/connections/gemini
        |                              +-- same-origin mutations
        |                              +-- metadata-only status
        |                              +-- encrypted hosted SecretStore required
        +-- Google OAuth -------+
  |
  +-- Settings
        +-- appearance
        +-- local approval preferences
```

```text
Installed Negroni plugin
  +-- capability_status
  +-- learning_core_status
  +-- draper_query (validated intents only)
  +-- draper_record_decision (local record only)
  +-- competitor_research (dry-run default)
  +-- resume_competitor_research
  +-- inspect_research_artifact
        |
        +-- strict JSON schemas and serialized execution
        +-- stable provider-neutral CLI only
        +-- sanitized receipts; no raw process output or private paths
        +-- no publishing, spend, account mutation, traffic, or scheduling
```

```text
Draper (control plane)
  +-- LearningCoreStorage contract
        +-- SQLite relational catalog (authoritative data + knowledge)
        +-- FTS5 full-text index + retrieval receipts
        +-- replaceable vector index (non-authoritative, rebuildable)
        +-- SHA-256 media references -> private content-addressed files
        +-- generated Obsidian-compatible vault (readable projection)
  +-- WarehouseAdapter
        +-- sanitized fixture adapter in the current milestone
        +-- future live warehouse adapter behind the same normalized contract
```

The local Learning Core is plugin runtime, not hosted Site storage. It remains
owner-, workspace-, and brand-scoped and creates an immutable version for each
learning transition. The Site exposes Library, Brands, and Integrations under Tools; Draper
remains plugin-only and receives no browser route, SQLite handle, private vault
path, generic SQL boundary, or machine-local data.
See [`draper-learning-core.md`](draper-learning-core.md).

The browser receives no runner or provider token. Brand and offer records
contain the complete non-secret intake, owner/timestamp metadata, versioned
Markdown seeds, review messages, approval fingerprints, and the latest compact
verified Drive receipt plus immutable intake basis for that exact offer. The
start route rejects a profile
and intake mismatch before consuming run approval; after a validated run it
persists and reads back the folder, Doc, optional Sheet, Markdown identity, and
current/stale basis state so Research, Brands, and Library survive a reload.
Stable brand and offer IDs preserve the Drive folder relationship when a
display name changes. Provider secrets
stay in the credential broker and are never written to D1. The production
broker owns the Google authorization-code callback, OAuth state verification,
encrypted refresh-token storage, refresh, and revocation handling; the local
developer broker uses pre-authorized Application Default Credentials only. The app accepts only sanitized
connection metadata and an HTTPS authorization URL.

The direct `/api/run` POST endpoint is not a browser execution shortcut. It
rejects requests until the browser has created an exact run ID and completed
the separate approve/start flow. Production Gemini connection routes also fail
closed until an encrypted hosted `SecretStore` and non-generative verifier are
wired; only tests and explicit non-production local previews may use the
in-memory adapter. See [`gemini-credential-broker.md`](gemini-credential-broker.md).

The app rejects noncanonical engines, a changed prompt source or order,
unauthorized outward actions, missing five-artifact receipts, unverified native
files, insecure competitor-report links, filename drift, failed
parity/evidence checks, unresolved citations, secret-like material, and
structural-example leakage.

The current seed and approved seed are separate pointers. Editing an approved
seed changes workspace status to `draft_changes` but leaves the Phase 2 pointer
on the prior approved revision. AI proposals are stored separately and can be
applied only while their parent is still the current revision.

Meta Ads Intelligence remains runner-side behind a stable CLI contract and is
invoked only when the competitor database is requested. The adapter validates
profile identity on every read, adds only verified Page-ID watches, and never
installs a scheduler. A declined database is `not_requested`; missing normalized
input for a requested database produces a durable `skipped` run; unavailable
official API credentials produce `blocked`. Google Sheet publishing is part of
the requested database receipt and never becomes an invented success.

## Competitor-research runtime boundary

The existing Negroni plugin calls the same deterministic boundary available to
other compatible harnesses:

```text
negroni research competitors run --project <research-set-id> --mode nightly --json
```

Negroni validates provider-neutral inputs and maps evidence into the five
canonical Research artifacts. The linked Meta Ads Intelligence engine owns its
SQLite schema, append-only observations and content versions, lifecycle, media,
and families. Private engine state and checkpoints stay under
`~/.local/share/negroni`; durable non-secret artifact revisions and collection
receipts stay under `~/Documents/tools-negroni`.

Sheets and Drive are projections, never authoritative storage. Publication is
an outbox state machine (`pending` → `drive_uploaded` → `sheet_linked` →
`complete`) with stable keys and readback hashes. The checked-in proof uses
fakes only and records zero external actions.

Engine-backed runtime tests require the optional sibling
`meta-ads-intelligence` checkout and skip explicitly when it is unavailable.

## Hosted identity trust boundary

The `oai-authenticated-user-email` header is trusted only on hostnames beneath
`NEGRONI_TRUSTED_INGRESS_SUFFIX` (default `.chatgpt.site`) or during localhost
preview. The Worker must not expose a `workers.dev` route or any direct ingress
that can bypass the authenticated ChatGPT hosting proxy.

## Local runner versus hosted capability

`bin/research-runner.ts` is the smallest locally verified HTTP boundary. It
requires a server bearer token, hashes the opaque owner key for isolation,
permits only `GET /health` and `POST /v1/research-runs`, and stores private
checkpoints separately from durable non-secret artifacts. Completed prompts
are not rerun after a partial attempt, and identical requests replay the same
final receipt. Each owner-scoped run uses a recoverable state lock; overlapping
requests fail explicitly with HTTP 409 instead of colliding on immutable
receipts. The default prompt, research, Google, and official collection
providers are blocked; no hosted runner is claimed.

Meta Graph API v26.0 capability is evaluated before any adapter is enabled.
Political and issue ads are eligible globally, and commercial ads are eligible
only when they reached an EU country. Ordinary non-EU commercial-ad collection
is therefore unsupported through the official endpoint. Eligible routes still
require owner authorization and a bounded live Page-ID coverage proof.
