# Architecture

```text
Authenticated browser
  |
  +-- Research tab
  |     +-- four inputs
  |     +-- owner-scoped saved sets -> D1
  |     +-- POST /api/run -> secure runner
  |           +-- authenticated owner -> owner-isolated Drive connection
  |           +-- fixed five-prompt research sequence
  |           +-- public research tools
  |           +-- Doc, Sheet, and Markdown -> Negroni Research folder
  |           +-- Meta Ads Intelligence nightly monitor
  |           +-- strict result receipt
  |
  +-- Settings tab
        +-- Codex OAuth --------+
        +-- Gemini API key -----+-> server-side credential broker
        +-- Google OAuth -------+
```

The browser receives no runner or provider token. Research sets contain only
the four intake values and owner/timestamp metadata. Provider secrets stay in
the credential broker and are never written to D1. The broker owns the Google
authorization-code callback, OAuth state verification, encrypted refresh-token
storage, refresh, and revocation handling. The app accepts only sanitized
connection metadata and an HTTPS authorization URL.

The app rejects noncanonical engines, a changed prompt source or order, extra
or missing outputs, non-Google links, unverified native files, filename drift,
failed parity/evidence checks, unresolved citations, secret-like material, and
structural-example leakage.

Meta Ads Intelligence remains runner-side behind a stable monitoring contract.
An active receipt requires a durable schedule ID, at least one verified watch,
and a real next-run timestamp. Missing authorization returns `partial` research
with a `blocked` monitoring receipt.
