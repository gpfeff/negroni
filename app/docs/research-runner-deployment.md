# Research runner deployment boundary

Updated: 2026-07-31

## Capability state

The owner-scoped HTTP boundary is locally verified and not deployed. The
default dependency set remains blocked unless separately configured. The local
launcher deliberately enables the reviewed embedded prompt bundle. The Gemini
research-engine adapter is locally verified against a fake upstream, and the
Google Drive filing boundary has a live no-paid-model proof. There is no paid
Gemini production proof, hosted broker, official Meta collection, or scheduler
capability.

## Deployment target

Run `bin/research-runner.ts` as a private Node.js 22 service on the Mac mini,
the sole Negroni execution host. Bind it to loopback or a private network only.
Mount these roots separately:

- repository code: read-only checkout;
- private runtime: `/Users/greg-mac-mini/.local/share/negroni` or an equivalent
  private persistent volume;
- durable non-secret artifacts:
  `/Users/greg-mac-mini/Documents/tools-negroni` or an equivalent durable
  review volume.

The service secret store must provide `NEGRONI_RUNNER_TOKEN`. Optional runtime
configuration is `NEGRONI_RUNNER_PORT`, `NEGRONI_RUNTIME_ROOT`, and
`NEGRONI_ARTIFACT_ROOT`. Live provider implementations additionally require an
owner-isolated prompt-source client, research provider, and credential broker;
provider secrets must never enter the browser, site database, source tree, or
receipts.

Gemini Deep Research additionally requires `CREDENTIAL_BROKER_URL` and
`CREDENTIAL_BROKER_TOKEN`. The key remains inside the credential broker. Each
approved request carries the exact owner-scoped run ID in the authenticated
`x-negroni-approved-run-id` server-to-runner header. There is no standing run-ID
environment authorization. One approved Negroni run creates one standard Deep
Research interaction covering all five required prompts.

The Site receives only:

- `LEAD_INTELLIGENCE_RUNNER_URL` — private HTTPS runner endpoint; and
- `LEAD_INTELLIGENCE_RUNNER_TOKEN` — server-to-server bearer token.

`GET /health` must return the bounded capability receipt without a private
path. `POST /v1/research-runs` requires the bearer token, opaque
`x-negroni-owner` identity, and exact approved run-ID header. Requests may
contain only the strict brand-and-offer intake plus fixed action and prompt
declarations already validated by the app contract.

## Exact approval-gated deployment diff

No part of this diff was applied during local verification.

1. Provision one private Node.js runner service from the reviewed repository
   revision.
2. Configure its server-side token, private runtime root, durable artifact
   root, and separately reviewed provider adapters.
3. Verify `/health`, owner isolation, blocked defaults, persistence, restart,
   and log redaction from the private network.
4. Set `LEAD_INTELLIGENCE_RUNNER_URL` and
   `LEAD_INTELLIGENCE_RUNNER_TOKEN` on the preserved Sites project
   `appgprj_6a6bf385b41c8191808c34035484ee4c`.
5. Deploy that saved project revision and run one approved owner-scoped
   rehearsal.

This diff does not activate a scheduler, authorize Meta, create Google files,
publish creative, spend money, launch traffic, or mutate an ad account. Those
remain separate approval boundaries.

## Rollback

1. Remove the two runner values from the preserved Site and redeploy the prior
   saved Site revision.
2. Stop the private runner service and revoke or rotate its server token.
3. Leave private checkpoints and immutable non-secret receipts intact for
   review; do not delete them as part of service rollback.
4. Do not delete Google files, revoke Google consent, or remove provider state
   without separate, exact approval.

## Current blockers

- The production URL and active ChatGPT account have a current read-only
  browser receipt, but the public response does not expose the owning project
  binding. Reverify that binding in the hosting control plane immediately
  before any approved Site environment change.
- The local broker has a verified Google Drive path through Application Default
  Credentials, but the hosted owner-scoped credential broker and its final
  Google OAuth callback are not deployed.
- The official Meta route has no approved 2–3 advertiser Page-ID pilot,
  authorization, or bounded coverage proof; ordinary non-EU commercial
  coverage is unsupported by the reviewed endpoint. Its 10-Page-ID query limit
  is sufficient once coverage is proven.
- No scheduler is installed or authorized.
