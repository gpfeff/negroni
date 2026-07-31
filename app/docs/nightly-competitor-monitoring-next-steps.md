# Nightly Competitor Monitoring — Next Steps

Updated: 2026-07-30

## Intended marketer workflow

1. Enter the client, offer, market, and customer information in Phase 1.
2. Run Client, Customer, and Competitor research.
3. Review proposed competitors and approve the correct verified Meta Page IDs.
4. Turn on nightly monitoring for that Negroni project.
5. Return to Negroni to review new ads, changed ads, creative families,
   landing-page changes, reports, and collection limitations.

Negroni is the control and reporting interface. Meta Ads Intelligence is the
research engine and private filing cabinet. Any approved always-on runner can
perform overnight collection; the plugin does not require Linux, BrowserOS, or
Hermes. A runner and a verified provider are still required for unattended
monitoring.

## Remaining live implementation

The provider-neutral CLI, installed MCP wrapper, isolated fixture engine path,
receipts, recovery, public signal, fake projection contract, five-artifact
mapper, local secure-runner boundary, dry-run schedule definition, and
Research-to-Creative approval gate are locally implemented. Remaining work is
authorization and live integration only:

1. Deploy the owner-controlled runner and connect the saved Phase 1 research-set
   ID to `/api/run` after approving the exact deployment diff.
2. Add the competitor and verified-Page-ID approval screen.
3. Configure and separately authorize a live collection method:
   - official Meta API only for political/issue ads or EU-reached commercial
     ads after a bounded capability proof against 2–3 real, approved Page IDs;
   - manual normalized imports as a non-automatic fallback.
4. Run and review one controlled collection before scheduling.
5. Add monitoring enable, pause, schedule, and health controls to the UI.
6. Install one persistent nightly dispatcher on the Linux worker.
7. Record `negroni-worker` as the sole scheduler owner for each enabled
   Negroni profile.
8. Read back and verify the first real overnight run before calling monitoring
   live.
9. Optionally connect and read back a restricted Google Sheet/Drive projection.

The dispatcher can process multiple isolated Negroni project profiles. It must
not create a competing schedule for the existing `pay-per-call` profile or
modify its current Hermes-owned job.

Meta Graph API v26.0 accepts up to 10 Page IDs in one Ads Archive request.
Ten competitors are therefore operationally small; whether the official API
returns the required ordinary commercial ads in the selected countries is the
capability gate.

## Pilot decisions

- First pilot client/project: pending
- Initial competitors: pending
- Nightly time: proposed 2:17 AM America/Los_Angeles
- Google Sheet projection: optional, pending
- Authorized Meta collection route: official API proof pending

## Dry-run schedule receipt

- Activation: `not_installed`
- Single owner: deterministic `negroni-competitor-<project-hash>`
- Cron: `17 2 * * *`
- Timezone: `America/Los_Angeles`
- Maximum runtime: 120 seconds
- Command: `negroni research competitors run --project <research-set-id> --mode nightly --deadline-seconds 120 --json`
- Overlap prevention: stable per-profile CLI lock
- Budget exposure: zero ad spend
- Network exposure: at most one bounded, read-only provider attempt per
  eligible run
- Disable/rollback: disable the single owner before the next eligible run,
  retain immutable receipts, and manually resume the last partial run if needed

No scheduler definition has been installed or activated.

## Current status

The profile-isolated database engine, stable provider-neutral nightly command,
two-night normalized fixture, append-only evidence, content versions,
conservative lifecycle/family/signal logic, immutable receipts, partial-resume
proof, fake projections, Phase 1 artifact mapping, result contracts, Home state
guidance, local runner/MCP boundaries, deterministic schedule planning, and
tests are implemented. No Negroni scheduler is installed, no live Meta
collection is claimed, and no Google publishing action has been performed.
