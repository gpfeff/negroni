# Competitor monitoring provider strategy

**Status:** active; amended 2026-07-30 after official coverage review
**Date:** 2026-07-29

## Decision

Negroni will provide competitor-ad monitoring through a provider-neutral
collection boundary. It will prefer a direct, authorized official Meta adapter
when a bounded live proof confirms that the needed public commercial-ad fields
and Page-ID coverage are available. Apify or another third-party collector may
be added later as an explicit fallback adapter, not as a core dependency.

Apify is therefore optional. Automated monitoring still requires a verified
collection source. If no official or third-party source is authorized and
working, Negroni supports only normalized manual imports and must report
monitoring as blocked rather than imply automatic discovery.

The current milestone does not select a third-party collector. Foreplay,
Firecrawl, BrowserOS collection, and Cloudflare scraping are excluded from the
planned nightly route. If official coverage is unavailable for the intended
country and ad category, monitoring stays blocked or uses reviewed normalized
manual imports.

For reviewed one-off public UI evidence, Negroni bundles the user-triggered
`tools/meta-ad-capture-extension`. It exports only cards already rendered in a
Meta Ad Library page, requests no cookie or hidden-network access, and always
reports partial coverage. It is a manual-import aid, not the nightly route and
not a substitute for an authorized unattended collector.

## Product behavior

Each monitored competitor uses a human-verified exact Meta Page ID. A single
approved scheduler owner refreshes enabled watches, persists an immutable run,
and computes the delta against the prior eligible complete run. On sign-in,
the application presents the latest completed delta immediately, including its
source, completion state, and scan time.

"New ad" means an ad newly observed by Negroni in a complete, verified Page-ID
scan. It does not claim discovery of ads that launched and ended between scans.
Blocked, skipped, partial, suspect, or stale source coverage must remain visible
and must never be presented as a zero-result scan.

## Non-goals and safeguards

- Do not make Apify a prerequisite for Negroni.
- Do not enable automated Meta UI collection by default or bypass access
  controls.
- Do not infer ad performance from visibility, longevity, or creative volume.
- Keep credentials and runtime state outside the repository and synced
  Documents workspace.

## Next proof before live implementation

Run one isolated, read-only official-adapter proof against 2–3 real,
owner-approved Page IDs in the intended countries. It must verify
authorization, Page-ID query behavior, fields returned, pagination and coverage
signals, delta correctness, and stale/blocked UI handling. The endpoint accepts
up to 10 Page IDs per query, so expand immediately to 10 only after that proof
passes. No credential or provider call is authorized by this decision record.
