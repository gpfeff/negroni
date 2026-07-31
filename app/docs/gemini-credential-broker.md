# Gemini credential broker

## Browser-to-broker flow

Research reads metadata from `GET /api/connections/gemini`. The browser sends a
key once in the JSON body of a same-origin HTTPS `PUT`; it is never placed in a
URL, cookie, browser storage, artifact, receipt, or status response. The input is
cleared after every submission. Replace and disconnect require deliberate UI
confirmation, and `DELETE` requires the exact confirmation phrase.

All routes derive the owner from the trusted Sites ingress identity (or the
isolated local-preview identity), reject unauthenticated access, use `no-store`,
and require an exact same-origin `Origin` header for mutations.

## Secret storage and verification

`SecretStore` is the server-only storage contract. Status reads safe broker
metadata and never fetches the complete credential. The repository includes an
in-memory adapter solely for automated tests and explicit non-production local
preview (`NEGRONI_LOCAL_FAKE_SECRET_BROKER=1`). Production uses the existing
`CREDENTIAL_BROKER_URL` and `CREDENTIAL_BROKER_TOKEN` boundary and fails closed
when either value is absent. The broker must expose owner-scoped
`/v1/secrets/gemini` metadata, create, replace, and delete operations backed by
1Password or an equivalently encrypted secret service. There is no database,
Sites Gemini-key environment variable, or plaintext-file fallback.

The production adapter verifies with Google's non-generative `models.list`
capability request. Verification errors must be mapped to the
fixed redacted messages in the service; upstream bodies and credentials must
never enter logs. Status returns only state, last-verified time, a truncated
SHA-256 fingerprint, and final four characters.

## Paid-run boundary

Saving or checking a key cannot invoke the research engine. The server creates
an exact random `run_<24 hex>` ID and authors and records the fixed
Standard model `deep-research-preview-04-2026`, five-prompt scope, honest cost
state, owner, approval time, and ten-minute expiry in D1.
`POST /api/research/runs/:runId/start` atomically claims that exact approval
only once and only when the same owner is connected. Missing, expired, reused,
and cross-owner approvals fail closed. Client-supplied model or scope values
are not authoritative, and Max or arbitrary models cannot enter the approval.

## Hosted blocker, deployment, and rollback

The hosted Sites runtime currently has no deployed 1Password-backed broker
binding, so connection status intentionally reports `connection_error` and
save/disconnect return 503. The repository-side hosted adapter and
non-generative Google models-list verifier are implemented, but deployment
requires provisioning the owner-scoped broker contract and binding its scoped
service identity, then live owner-only/anonymous verification and a private
deployment. Those external mutations remain approval-gated.

Rollback is code-only: restore the previous Sites release and revoke the new
broker service binding. Do not delete or rotate a stored Gemini credential as
part of rollback; that is a separately approved credential mutation. Existing
Research artifacts and the installed Negroni plugin package are unaffected.
