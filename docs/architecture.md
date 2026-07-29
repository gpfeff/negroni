# Architecture

```text
One-page browser intake
        |
        v
Same-origin /api/run boundary
        |
        v
Configured secure runner
        |
        +-- canonical lead-generation-ads-discovery-intelligence skill
        +-- public research tools
        +-- native Google Doc and Sheet connector
        +-- Meta Ads Intelligence adapter
        |       +-- project-isolated watchlist and archive
        |       +-- one idempotent nightly schedule
        |       +-- active or blocked monitoring receipt
        |
        v
Strict response validation
        |
        +-- Open Google Doc
        +-- Open Google Sheet
        +-- Download Markdown
```

The browser receives no runner token. Attachments are forwarded for the active request and are not persisted by the page. The app rejects noncanonical engines, extra or missing outputs, non-Google links, unverified native files, filename drift, failed parity/evidence checks, unresolved citations, secret-like material, and structural-example leakage.

Meta Ads Intelligence stays runner-side behind a stable monitoring contract.
The initial run resolves exact advertiser watches. The runner must reuse one
scheduler owner, update the same isolated archive and Google Sheet, and return
a durable receipt. An active receipt requires a non-empty schedule ID, at least
one verified watch, and a real next-run timestamp. Without an authorized
collection adapter, the research result is `partial` and the monitoring receipt
is `blocked`.

The current Sites environment has no configured secure runner, Google Workspace
connector, or runner-side monitoring adapter. Its honest runtime state is
`blocked`; it does not simulate research or schedules.
