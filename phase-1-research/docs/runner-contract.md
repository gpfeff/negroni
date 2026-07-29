# Secure runner contract

The browser application is not the research engine, Google publisher, ad
collector, or scheduler. A separately deployed secure runner owns those
capabilities and returns contract `3.0`.

## Initial run

The runner must execute this sequence:

1. Validate the intake, approved actions, attachment limits, and secret scan.
2. Invoke the canonical `lead-generation-ads-discovery-intelligence` skill.
3. Produce explicit coverage receipts for:
   - client;
   - market awareness;
   - B2B lead buyer;
   - B2C customer;
   - competitors;
   - master synthesis.
4. Create exactly:
   - `<project> — Master Research` as a native Google Doc;
   - `<project> — Competitor Ads` as a native Google Sheet;
   - `<project-slug>-master-research.md`.
5. Read back both native Google files, verify Markdown/Doc parity, validate
   citations and competitor-row provenance, and scan for secrets and
   structural-example leakage.
6. Resolve the researched competitors into stable, verified advertiser
   identities and pass that watchlist to the competitor-monitoring adapter.
7. Return the validated deliverables, coverage receipt, limitations, and an
   active or blocked monitoring receipt.

Research status is `complete` only when every coverage lane is complete and the
nightly monitor is active. It is `partial` when at least one lane is explicitly
limited or monitoring is explicitly blocked. Missing Google deliverables are a
failed or blocked run, not a partial success.

## Competitor-monitoring adapter

The runner keeps Meta-specific behavior behind one stable operation:

```ts
type EnsureNightlyMonitor = (request: {
  project_id: string;
  archive_profile: string;
  google_sheet_id: string;
  watchlist: Array<{
    advertiser_id: string;
    advertiser_name: string;
    source: string;
    verified: true;
  }>;
  cadence: "nightly";
  local_time: "02:17";
  timezone: string;
}) => Promise<CompetitorMonitoringReceipt>;
```

`EnsureNightlyMonitor` must be idempotent. Repeating it for the same project
updates the project watchlist and reuses the configured scheduler owner. It
must not create a second scheduler.

An active receipt requires a durable schedule ID, one or more verified watches,
and a real next-run timestamp. When collection authorization, scheduler
ownership, profile isolation, or Google publishing is unavailable, the adapter
returns `blocked` with the exact reason and no schedule ID or next-run claim.

## Nightly refresh

Each nightly run updates the same project-isolated Meta Ads Intelligence archive
and the same authoritative Google Sheet. It preserves:

- advertiser and stable ad identity;
- first-seen and last-seen timestamps;
- active, inactive, and unknown lifecycle state;
- creative and media identity;
- observed copy, CTA, destination, and format;
- source and collection evidence;
- run coverage and limitations.

Permitted run states are `complete`, `complete_zero`, `partial`, `blocked`,
`suspect`, and `failed`. Visibility, longevity, and creative volume are survivor
evidence only and never proof of targeting, spend, conversions, lead quality,
profitability, or winning performance.

Collection must use an authorized public or official route. The adapter must
not automate Meta's UI without a documented authorization basis, bypass access
controls, click ads, submit forms, or launch traffic.

## Source boundary

The Pay Per Lead Nation Pro Step #2 lessons and live prompt inform the workflow
shape only: market awareness, competitor research, customer psychographics, and
master synthesis. Protected examples, niche conclusions, claims, and branded
course text are not runner instructions or reusable findings.

The current local course archive includes metadata for lessons 2.1–2.5. Their
video files and transcripts are not present locally. Linked example PDFs and
DOCX files are represented by metadata but are also not present. Receipts must
not claim those unavailable materials were reviewed.
