# PHASE 1: RESEARCH

A one-page thin client for turning partial lead-generation context into three complete deliverables and one ongoing competitor-ad monitor:

1. Google Doc — complete master research report
2. Google Sheet — authoritative competitor-ad archive
3. Markdown — portable master report matching the Google Doc

The research covers the client, market awareness, B2B lead buyer, B2C customer,
competitors, and master synthesis. After the initial run resolves a verified
competitor watchlist, the secure runner configures Meta Ads Intelligence to
refresh the same archive nightly at 02:17 in the intake timezone. The page
shows the returned schedule receipt or the exact blocker; it never claims
monitoring is active from a request alone.

The shared `lead-generation-ads-discovery-intelligence` skill remains the sole research engine. The app does not contain a research methodology or synthetic market fixture.

## Runtime boundary

The browser submits intake and attachments to the same-origin `/api/run` route.
That route keeps credentials server-side and forwards the package to a
configured secure runner. A response is accepted only when it attests to the
canonical skill and passes the exact-three-output, research-coverage, Google
readback, report-parity, competitor-evidence, citation, secret, example-leak,
and monitoring-receipt checks.

Configure these server-side values in the hosting environment:

- `LEAD_INTELLIGENCE_RUNNER_URL`
- `LEAD_INTELLIGENCE_RUNNER_TOKEN`

When either value is unavailable, the page reports the exact blocker and
disables execution. The runner must separately possess an authorized
competitor-ad collection route and one scheduler owner. Without that route,
usable research may return `partial` with an explicit monitoring blocker. The
page never falls back to a fixture or fabricates output links or schedule state.

## Step #2 reference boundary

The four research lanes follow the structure of the Pay Per Lead Nation Pro
Step #2 prompt: market awareness, competitors, customer psychographics, and
master marketing intelligence. The course is a structural reference only.
Its niche examples, outputs, claims, and branded text must not enter source,
fixtures, or deliverables.

The course archive contains metadata for lessons 2.1–2.5 and their linked live
prompt. The corresponding videos and transcripts are not stored locally, and
the example PDF and DOCX resources are represented only by archive metadata.
Do not claim those unavailable materials were reviewed.

The deterministic runner and monitoring requirements are defined in
[`docs/runner-contract.md`](docs/runner-contract.md).

## Commands

```bash
npm install
npm run dev
npm run validate
npm run qa:visual
```

Dependencies are runtime state and should live outside the synced Documents tree.
