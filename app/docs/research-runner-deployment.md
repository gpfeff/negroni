# Research runner deployment boundary

Updated: 2026-07-31

## Capability state

The owner-only Site interface is deployed as version 13. Its private runner and
credential-broker bindings are not deployed, so hosted research correctly
remains blocked. The owner-scoped private-service contract is implemented and
locally verified: `npm run check:private` validates its ports and stable secrets,
and `npm run serve:private` starts only the loopback broker and runner. Neither
command installs a persistent service or creates an external route. The local
launcher enables the reviewed embedded prompt bundle. The Gemini research
adapter is verified against a fake upstream, and Google Drive filing has a live
no-paid-model proof. There is no paid Gemini production proof, hosted broker,
official Meta collection, or scheduler capability.

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

The service environment must provide distinct, stable
`NEGRONI_RUNNER_TOKEN` and `CREDENTIAL_BROKER_TOKEN` values, each 32–512
non-whitespace characters. Run the fail-closed preflight before service start:

```bash
npm run check:private
npm run serve:private
```

Optional runtime
configuration is `NEGRONI_RUNNER_PORT`, `NEGRONI_RUNTIME_ROOT`, and
`NEGRONI_ARTIFACT_ROOT`. Live provider implementations additionally require an
owner-isolated prompt-source client, research provider, and credential broker;
provider secrets must never enter the browser, site database, source tree, or
receipts.

Gemini Deep Research additionally requires the runner's loopback
`CREDENTIAL_BROKER_URL`. The key remains inside the credential broker. Site
owners are converted to stable SHA-256 owner keys before broker access; pasted
session credentials, status, disconnect, Gemini interaction proxying, and Drive
filing are isolated by that key. Each
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

No DNS route, Cloudflare Access policy, persistent service, or Site runtime
binding from this diff was applied during local verification.

1. Install the reviewed `npm run serve:private` contract as one persistent,
   loopback-only Mac mini service without changing existing service routes.
2. Configure its distinct server-side tokens, private runtime root, durable
   artifact root, and separately reviewed provider adapters.
3. Add a new authenticated HTTPS route and Cloudflare Access policy for the
   runner and broker; do not reuse or broaden an existing route.
4. Verify `/health`, owner isolation, blocked defaults, restart behavior, and
   log redaction through the authenticated private route.
5. Set `LEAD_INTELLIGENCE_RUNNER_URL` and
   `LEAD_INTELLIGENCE_RUNNER_TOKEN` on the preserved Sites project
   `appgprj_6a6bf385b41c8191808c34035484ee4c`.
6. Set `CREDENTIAL_BROKER_URL`, `CREDENTIAL_BROKER_TOKEN`, and the reviewed
   proposal-only `LEAD_INTELLIGENCE_REVIEW_URL`.
7. Deploy that saved project revision and run one approved owner-scoped
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

- The owner-only Site interface is live as version 13, but no authenticated
  production save/reload has verified its D1 record binding.
- The local broker has a verified Google Drive path through Application Default
  Credentials, but no new authenticated Cloudflare route, persistent private
  service, Site broker binding, or final Google OAuth callback is deployed.
- The official Meta route has no approved 2–3 advertiser Page-ID pilot,
  authorization, or bounded coverage proof; ordinary non-EU commercial
  coverage is unsupported by the reviewed endpoint. Its 10-Page-ID query limit
  is sufficient once coverage is proven.
- No scheduler is installed or authorized.
