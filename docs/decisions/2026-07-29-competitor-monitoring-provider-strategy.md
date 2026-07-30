# Competitor monitoring provider strategy

**Status:** recorded product decision
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

## Next proof before implementation

Run one isolated, read-only official-adapter proof against a test profile. It
must verify authorization, Page-ID query behavior, fields returned, pagination
and coverage signals, delta correctness, and stale/blocked UI handling. Only
then decide whether a fallback provider is necessary.
