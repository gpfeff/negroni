# Competitor Research v1 architecture

**Status:** accepted and implemented locally
**Date:** 2026-07-30

## Decision

Competitor-ad research ships inside the existing Negroni plugin. Negroni owns
provider-neutral contracts, the stable CLI, artifact mapping, recovery
receipts, projection contracts, skills, and approval gates. The existing Meta
Ads Intelligence engine remains the single owner of SQLite observations,
content versions, lifecycle, media, and creative families; Negroni does not
build a second competitor-ad database.

The stable boundary is:

```text
negroni research competitors run --project <research-set-id> --mode nightly --json
```

Machine-local private state stays under `~/.local/share/negroni`. Durable
non-secret Research packages and immutable receipts stay under
`~/Documents/tools-negroni`. Source, sanitized fixtures, tests, and contracts
stay in the repository.

## Evidence and handoff

`public-winner-signal-v2` ranks visible durability, continuity, reuse,
expansion, and evidence completeness. Missing inputs award no points and remain
unknown. The signal never proves targeting, spend, conversions, CPA, ROAS,
revenue, profit, or a verified winner.

The five existing Research artifacts remain canonical. Creative accepts only
an explicitly approved exact `creative-brief.json` revision and SHA-256 through
the versioned Research-to-Creative pointer. Competitor evidence can produce an
original pattern hypothesis; it cannot authorize copying an asset, execution,
identity, copy, or claim.

## Local proof and blocked capabilities

The v1 acceptance fixture uses two sanitized normalized-import nights and fake
AI/Sheets/Drive providers. It proves append-only observations, content change,
temporary eligible absence, media dedupe, family grouping, conservative signal,
immutable artifacts, partial failure, resume, and idempotency without network
or external mutation. Fixture media is size-bounded and atomically published
with verified SHA-256 and private permissions. Each attempt writes a durable
running receipt; local failures and safe process interruption preserve a final
bounded receipt, recovery command, checkpoint, and released profile lock.

Official Meta collection, BrowserOS collection, paid collectors, live Google
mutation, scheduler installation, publishing, account mutation, traffic, and
spend remain blocked until separately approved and verified.
