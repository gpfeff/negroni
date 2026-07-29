# Architecture

```text
Authenticated browser
  |
  +-- Research tab
  |     +-- four inputs
  |     +-- owner-scoped saved sets -> D1
  |     +-- versioned Markdown seed review -> D1
  |     |     +-- direct edits and permanent notes
  |     |     +-- POST /api/review -> secure review runner
  |     |     |     +-- proposed revision only
  |     |     +-- explicit apply, reject, restore, and approve
  |     |     +-- approved revision ID + SHA-256 -> Phase 2
  |     +-- POST /api/run -> secure runner
  |           +-- authenticated owner -> owner-isolated Drive connection
  |           +-- fixed five-prompt research sequence
  |           +-- public research tools
  |           +-- five durable Research artifacts
  |           +-- Doc and Markdown -> Negroni Research folder
  |           +-- optional restricted competitor Sheet
  |           +-- Meta Ads Intelligence server adapter
  |                 +-- project-derived isolated profile
  |                 +-- SQLite-owned lifecycle/media/ratings
  |                 +-- scheduler-neutral daily refresh
  |                 +-- deterministic snapshot and daily delta
  |           +-- strict result receipt
  |
  +-- Settings tab
        +-- Codex OAuth --------+
        +-- Gemini API key -----+-> server-side credential broker
        +-- Google OAuth -------+
```

The browser receives no runner or provider token. Research sets contain the
four intake values, owner/timestamp metadata, versioned Markdown seeds, review
messages, and approval fingerprints. Provider secrets stay in the credential
broker and are never written to D1. The broker owns the Google
authorization-code callback, OAuth state verification, encrypted refresh-token
storage, refresh, and revocation handling. The app accepts only sanitized
connection metadata and an HTTPS authorization URL.

The app rejects noncanonical engines, a changed prompt source or order, extra
or missing outward actions, missing five-artifact receipts, unverified native
files, insecure competitor-report links, filename drift, failed
parity/evidence checks, unresolved citations, secret-like material, and
structural-example leakage.

The current seed and approved seed are separate pointers. Editing an approved
seed changes workspace status to `draft_changes` but leaves the Phase 2 pointer
on the prior approved revision. AI proposals are stored separately and can be
applied only while their parent is still the current revision.

Meta Ads Intelligence remains runner-side behind a stable CLI contract. The
adapter validates profile identity on every read, adds only verified Page-ID
watches, and never installs a scheduler. Missing normalized input produces a
durable `skipped` run; unavailable official API credentials produce `blocked`.
Google publishing is optional and does not change local collection, storage,
analysis, or report availability.
