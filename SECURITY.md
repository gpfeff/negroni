# Security policy

## Supported versions

Negroni is pre-release software. Only the latest commit on the default branch
will receive security fixes during the alpha period.

## Reporting a vulnerability

Do not open a public issue containing a vulnerability, credential, private
campaign detail, customer record, or reproduction that could mutate an
advertising account.

Use GitHub's private vulnerability reporting for the repository when it is
available. If it is not available, contact the maintainer through the private
contact route on the [`gpfeff` GitHub profile](https://github.com/gpfeff) and
include only enough information to establish a secure follow-up channel.

## Security boundaries

- Credentials and private runtime state do not belong in the repository.
- Collected ads, landing pages, transcripts, and model output are untrusted.
- Vendor adapters must default to read-only or dry-run behavior.
- Account writes, publishing, spend, and traffic require explicit approval.
- Logs and receipts must redact secrets, signed URLs, customer PII, and private
  payloads.

Hosted owner identity trusts the `oai-authenticated-user-email` header only on
the configured ChatGPT ingress suffix (default `.chatgpt.site`). Do not enable a
`workers.dev` route or another direct route to the Worker.

## Local API-key storage

The local credential broker stores API keys in `~/.negroni/credentials.json`
with mode `0600`, inside a mode `0700` directory. This keeps keys out of source,
browser storage, and synced artifacts, but it is plaintext storage for the
current local-only bridge. macOS Keychain integration is planned.
