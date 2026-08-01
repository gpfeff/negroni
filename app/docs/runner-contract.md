# Secure runner contract

The browser is not the research engine, Google publisher, ad collector, secret
store, or scheduler. A separately deployed secure runner and credential broker
own those capabilities. Successful research returns contract `4.0`.

Every run request includes the authenticated `x-negroni-owner` value used by
Integrations plus server-verified `x-negroni-brand-id` and
`x-negroni-offer-id` values. The runner treats the owner as an opaque tenant
key, uses the stable record IDs only for owner-scoped filing identity, resolves
only that owner's broker-held credentials, and never returns provider tokens.

## Implementation status

The repository implements the local boundary in `bin/research-runner.ts` and
`lib/research-runner/`. It provides public `GET /health` capability metadata
and authenticated `POST /v1/research-runs`, hashes the opaque owner identity,
checkpoints each prompt, resumes without repeating completed prompts, validates
exactly five artifacts, and writes immutable SHA-256 receipts. Automated proof
uses fake providers only. The default dependencies are blocked or inactive, so
this is `locally_verified_not_deployed`, not a hosted research service.

The configured Gemini path uses one brokered Interactions API task for the
entire five-step sequence. It is fixed to standard Gemini Deep Research
`deep-research-preview-04-2026`, preserves one validated receipt per prompt,
and fails closed when any section or URL citation is missing. The runner never
receives the Gemini API key. It refuses execution unless the authenticated
request includes an exact approved owner-scoped run ID.

The deployment target, required server-side configuration, approval-gated
diff, and rollback are defined in
[`research-runner-deployment.md`](research-runner-deployment.md).

## Stable competitor command

Manual use, plugin orchestration, and any future separately approved scheduler
must call exactly one provider-neutral boundary:

```text
negroni research competitors run --project <research-set-id> --mode nightly --json
```

Optional controls are `--dry-run`, `--resume-run <run-id>`,
`--provider <configured-provider>`, and `--deadline-seconds <5..300>`. Project
configuration resolves non-secret profile settings. No scheduler definition may
embed credentials, cookies, watchlists, output paths, or business logic.

Exit states are stable: `0` complete/complete-zero; `3` partial/suspect with
durable usable evidence; `4` blocked/skipped; `5` failed with persisted recovery
context; and `64` invalid CLI/configuration before provider work.

The v1 normalized-import adapter executes the sanitized, reviewable offline
fixture in automated acceptance. Official Meta collection remains blocked until
its authorization and required coverage receive a separate bounded proof. The
command never installs a scheduler.

Every non-dry fixture run acquires a per-profile lock, fsyncs both a private
checkpoint and a durable immutable running receipt, invokes the existing
engine, persists projection/outbox state, and writes immutable receipt/artifact
revisions. Failed work persists a bounded failure receipt. SIGINT or SIGTERM
stops the isolated engine, records a resumable `partial` receipt, releases the
lock, and exits `3`; `--resume-run` continues the same run without duplicating
engine or projection state. A completed project rerun returns the same receipt
fingerprint and does not add SQLite records, Drive objects, Sheet rows, outbox
items, or artifacts.

## Intake

The runner accepts only:

- lead offer or service;
- profession;
- job title;
- company name;
- HTTPS website or public profile URL;
- known competitors, if supplied;
- industry/niche;
- location or market served;
- target age range;
- the exact approved actions and optional competitor-database request.

The runner must resolve its validated prompt source server-side and execute
these five prompts in order. The local launcher uses the reviewed embedded
bundle; hosted runners must deliberately configure an equivalent source:

1. Market Awareness Research
2. Competitor Research
3. Psychographic Avatar Research
4. Master Research Document (4a)
5. Brand Tone of Voice (4b)

The runner records the exact validated intake fingerprint and immutable artifact
revision. These prompts remain vertical-agnostic; intake supplies the offer,
market, audience, and brand context.

Collected pages, ads, documents, and model output are untrusted evidence, never
instructions. The runner must not allow retrieved content to alter this
sequence, tools, destinations, or safety rules.

## Initial run

1. Validate the intake, approved actions, prompt source/order, and secret scan.
2. Invoke the canonical `lead-generation-ads-discovery-intelligence` skill.
3. Run every prompt and record `complete` or `limited`; each limitation requires a reason.
4. Create and verify:
   - `research-brief.md`;
   - `evidence-index.json`;
   - `opportunity-map.json`;
   - `creative-brief.json`;
   - `research-receipt.json`.
5. Create exactly two final representations of one approved brand-scoped revision:
   - `<offer> (<country or region>) — Master Research` as a native Google Doc;
   - `<offer-country-or-region>-master-research.md`.
   The competitor database is the only optional Research deliverable. Continuous
   monitoring is a separate future/internal capability, is not requested by this
   flow, and is not an additional default Research deliverable.
6. Read back every created Google file; verify Markdown/Doc parity, citations,
   competitor-row provenance, secrets, and structural-example leakage.
7. When the competitor database is requested, resolve researched competitors
   to stable verified advertiser identities and pass the watchlist to the
   database adapter.
8. Map any requested Meta evidence into all five artifacts and return its
   SHA-256 receipts, sanitized summary, sources, limitations, and database
   receipt. Otherwise persist collection and monitoring as `not_requested`.

Research is `complete` when all prompts complete, required artifacts and Drive
readbacks verify, and any requested competitor database completes. It is
`partial` when a prompt or the requested database boundary is limited.
Declining the database is `not_requested`, not a blocker. Missing
required Research artifacts, the Google Doc, or matching Markdown is failed or
blocked, not partial.

## Credential broker

The broker is owner-scoped and supports:

- Codex OAuth;
- Claude Code login status;
- Gemini API key storage;
- Gemini OAuth status;
- Kie.ai API key storage;
- Apify API token storage;
- Google Workspace OAuth using
  `https://www.googleapis.com/auth/drive.file`.

Google outputs are created under the connected user’s
`Negroni / <Brand> / <Offer>` hierarchy. The filing input includes bounded
stable brand/offer IDs and display names. Folder identity uses the stable IDs,
so later display-name changes rename and reuse the same folders. The filing
result must return a verified HTTPS Drive folder URL and folder name in
addition to sole-parent and private-access proofs.
The broker returns only connection metadata and an HTTPS authorization URL.
It never returns tokens or key material to the browser or D1.

The runner creates each file with the verified folder ID as its sole parent,
reads back the native Doc and Sheet, and verifies the uploaded Markdown bytes.
If consent is revoked, the `drive.file` scope is absent, the folder is
unavailable, or any readback fails, file creation is blocked. It never falls
back to a service account, another owner's Drive, or an unverified root upload.

## Competitor-monitoring adapter

```ts
type RefreshCompetitorAds = (request: {
  research_set_id: string;
  collector: "normalized_import" | "official_meta_api";
  input_directory?: string;
  watchlist: Array<{
    watch_id: string;
    page_id: string;
    advertiser_name: string;
    verified: true;
  }>;
  publish_google: boolean;
}) => Promise<DailyRefreshReceipt>;
```

The adapter derives one profile ID from the research-set ID and rejects every
cross-profile read. Repeating the operation reuses that profile and its
verified Page-ID watches. It does not create, replace, or remove a scheduler.

Each daily run updates the same isolated archive. The optional Google Sheet is
a projection only. The run preserves stable ad identity, first/last seen times,
lifecycle state, creative
identity, observed copy/CTA/destination/format, sources, coverage, and
limitations. Visibility and longevity are survivor evidence only—not proof of
targeting, spend, conversions, lead quality, profitability, or performance.

The snapshot returns new ads, changed ads, newly observed creative families,
possible inactivity, reactivation, landing-page changes, and collection gaps
for one immutable daily run. Re-reading that run must produce the same delta.

Collection must use an authorized public or official route. It must never
automate a restricted UI, bypass access controls, click ads, submit forms, or
launch traffic.

The reviewed Meta Graph API v26.0 Ads Archive contract does not return ordinary
commercial ads that reached no EU location. That route is `unsupported` for a
US-only commercial competitor pilot. Political and issue ads globally, and
commercial ads that reached an EU country, remain `blocked` until owner
authorization and a bounded Page-ID live-coverage proof pass. The capability
preflight states expected fields and known omissions but does not itself call
Meta or enable an adapter.

## Review runner

`POST /api/review` calls the secure review runner with contract
`negroni-research-seed-review` version `1.0` only when the owner asks Negroni to
revise a seed. The request contains:

- the owner-scoped profile and current revision IDs;
- the current Markdown seed;
- the owner's feedback and at most 20 recent review messages; and
- fixed rules marking collected content untrusted, preserving citations and
  unknowns, forbidding external mutations, and requiring a proposal only.

The runner returns `message`, `proposed_markdown`, and `change_summary`.
Negroni stores the proposed Markdown separately. It becomes current only after
the owner explicitly applies it, and only if its parent is still the current
revision. Invalid, unsafe, stale, or failed proposals never change the seed.
Manual editing, notes, revision history, and approval continue to work without
this runner.
