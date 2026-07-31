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

`SecretStore` is the server-only storage contract. The repository includes an
in-memory adapter solely for automated tests and explicit non-production local
preview (`NEGRONI_LOCAL_FAKE_SECRET_BROKER=1`). Production reads
`GEMINI_API_KEY` only from Sites' encrypted runtime-secret facility. That
adapter is intentionally read-only: replacement and disconnect occur through
owner-only Sites secret settings because the running app cannot mutate its own
secret bindings. There is no database or plaintext-file fallback.

The production adapter verifies with Google's non-generative `models.list`
capability request. Verification errors must be mapped to the
fixed redacted messages in the service; upstream bodies and credentials must
never enter logs. Status returns only state, last-verified time, a truncated
SHA-256 fingerprint, and final four characters.

## Paid-run boundary

Saving or checking a key cannot invoke the research engine. The UI creates an
exact random `run_<24 hex>` ID and displays the fixed Standard model
`deep-research-preview-04-2026`, five-prompt scope, and the honest cost state.
`POST /api/research/runs/:runId/approve` records the exact owner/run pair.
`POST /api/research/runs/:runId/start` consumes that approval only when the same
owner is connected. Max model requests are rejected.

## Hosted blocker, deployment, and rollback

The hosted adapter uses Sites' encrypted server-secret facility. The remaining
provisioning step is to set `GEMINI_API_KEY` as a secret in the owner-only Sites
configuration and deploy that environment revision. Until then status reports
`connection_error` and mutation routes fail closed.

Rollback is code-only: restore the previous Sites release and revoke the new
broker service binding. Do not delete or rotate a stored Gemini credential as
part of rollback; that is a separately approved credential mutation. Existing
Research artifacts and the installed Negroni plugin package are unaffected.
