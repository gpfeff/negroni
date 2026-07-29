# PHASE 1: RESEARCH

A one-page thin client for turning partial lead-generation context into three complete deliverables:

1. Google Doc — complete main intelligence report
2. Google Sheet — complete competitor report
3. Markdown — portable main report matching the Google Doc

The shared `lead-generation-ads-discovery-intelligence` skill remains the sole research engine. The app does not contain a research methodology or synthetic market fixture.

## Runtime boundary

The browser submits intake and attachments to the same-origin `/api/run` route. That route keeps credentials server-side and forwards the package to a configured secure runner. A response is accepted only when it attests to the canonical skill and passes the exact-three-output, Google readback, report-parity, competitor-evidence, citation, secret, and example-leak checks.

Configure these server-side values in the hosting environment:

- `LEAD_INTELLIGENCE_RUNNER_URL`
- `LEAD_INTELLIGENCE_RUNNER_TOKEN`

When either value is unavailable, the page reports the exact blocker and disables execution. It never falls back to a fixture or fabricates output links.

## Commands

```bash
npm install
npm run dev
npm run validate
npm run qa:visual
```

Dependencies are runtime state and should live outside the synced Documents tree.
