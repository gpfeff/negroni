# Nightly Competitor Monitoring — Next Steps

Updated: 2026-07-29

## Intended marketer workflow

1. Enter the client, offer, market, and customer information in Phase 1.
2. Run Client, Customer, and Competitor research.
3. Review proposed competitors and approve the correct verified Meta Page IDs.
4. Turn on nightly monitoring for that Negroni project.
5. Return to Negroni to review new ads, changed ads, creative families,
   landing-page changes, reports, and collection limitations.

Negroni is the control and reporting interface. Meta Ads Intelligence is the
research engine and private filing cabinet. A persistent Linux worker performs
the overnight collection. Hermes is not required for new Negroni projects.

## Remaining implementation

1. Connect the saved Phase 1 research-set ID to `/api/run` and the secure runner.
2. Add the competitor and verified-Page-ID approval screen.
3. Configure an authorized collection method:
   - official Meta API, preferred when available;
   - an approved normalized collector; or
   - manual normalized imports as a non-automatic fallback.
4. Run and review one controlled collection before scheduling.
5. Add monitoring enable, pause, schedule, and health controls to the UI.
6. Install one persistent nightly dispatcher on the Linux worker.
7. Record `negroni-worker` as the sole scheduler owner for each enabled
   Negroni profile.
8. Read back and verify the first real overnight run before calling monitoring
   live.
9. Optionally connect a restricted Google Sheet review projection.

The dispatcher can process multiple isolated Negroni project profiles. It must
not create a competing schedule for the existing `pay-per-call` profile or
modify its current Hermes-owned job.

## Pilot decisions

- First pilot client/project: pending
- Initial competitors: pending
- Nightly time: proposed 2:17 AM America/Los_Angeles
- Google Sheet projection: optional, pending
- Authorized Meta collection route: pending

## Current status

The profile-isolated database engine, daily refresh operation, deterministic
delta, Phase 1 artifact mapping, result contract, UI summary module, and tests
are implemented. No Negroni scheduler is installed, no live Meta collection is
claimed, and no Google publishing action has been performed.
