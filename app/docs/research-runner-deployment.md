# Research runner deployment boundary

Updated: 2026-07-30

## Capability state

The owner-scoped HTTP boundary is locally verified and not deployed. The
default dependency set is deliberately blocked: it has no live prompt-source,
research-engine, Google Drive, official Meta, or scheduler capability. Local
tests use fake providers and prove contracts, not live access.

## Deployment target

Run `bin/research-runner.ts` as a private Node.js 22 service on an
owner-controlled Mac mini or Linux container. Bind it to loopback or a private
network only. Mount these roots separately:

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

The Site receives only:

- `LEAD_INTELLIGENCE_RUNNER_URL` — private HTTPS runner endpoint; and
- `LEAD_INTELLIGENCE_RUNNER_TOKEN` — server-to-server bearer token.

`GET /health` must return the bounded capability receipt without a token or
private path. `POST /v1/research-runs` requires the bearer token and the opaque
`x-negroni-owner` identity. Requests may contain only the strict customer-profile
and research-scope intake plus the fixed action and prompt declarations already validated by the
app contract.

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
   `appgprj_6a69601f2d3881919387445a11ad4a5b`.
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
- The Negroni credential broker and its final Google OAuth callback do not
  exist as verified live services.
- The official Meta route has no approved 2–3 advertiser Page-ID pilot,
  authorization, or bounded coverage proof; ordinary non-EU commercial
  coverage is unsupported by the reviewed endpoint. Its 10-Page-ID query limit
  is sufficient once coverage is proven.
- No scheduler is installed or authorized.
