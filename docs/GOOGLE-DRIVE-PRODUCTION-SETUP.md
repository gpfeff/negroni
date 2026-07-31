# Google Drive production setup

## Current state

- Production UI: https://lead-intelligence-workbench.g-pfeffer.chatgpt.site
- Expected Sites project: `appgprj_6a69601f2d3881919387445a11ad4a5b`.
- The production URL returned the expected Negroni interface and page title on
  2026-07-30. The active ChatGPT browser session identifies Greg Pfeffer Pro,
  and the repository hosting config still names the expected project ID.
- The public Site response does not independently expose the owning project
  binding. Reverify that binding in the hosting control plane immediately
  before any environment mutation or deployment.
- The connected Google Drive connector identifies
  `greg.a.pfeffer@gmail.com` (Greg Pfeffer).
- That connector identity does not prove a Negroni broker-held OAuth grant,
  minimum `drive.file` scope, callback, or app-owned folder authority.
- Google Drive OAuth and automatic filing are implemented in the UI and API
  boundary, and the owner-scoped runner contract is locally verified.
- Production has no verified credential-broker or research-runner
  configuration.
- Google Drive and research actions therefore remain visibly blocked.

No Google file or folder was created, changed, shared, moved, or deleted during
this verification.

## Exact bounded live-proof proposal

This proposal is not authorization to execute it.

- Account: `greg.a.pfeffer@gmail.com`, reverified inside the Negroni OAuth
  callback before any write.
- Folder: private `Negroni Research`, created or reused directly under that
  verified account's **My Drive** root.
- Files:
  - `<offer> (<country or region>) — Master Research`, native Google Doc;
  - `<offer> (<country or region>) — Competitor Ads`, native Google Sheet only
    when competitor projection is included in the approved rehearsal; and
  - `<offer-country-or-region>-master-research.md`.
- Permissions: owner-only/private; no link sharing and no additional grantees.
- Expected readback: exact names, each file's sole verified `Negroni Research`
  parent, private access, native Doc text hash equal to the Markdown hash,
  uploaded Markdown byte hash, and optional Sheet header/row provenance.
- Rollback: stop before mutation on any identity, scope, folder, parent, access,
  or readback mismatch. Cleanup would delete only the IDs created by this one
  rehearsal, and only after separate cleanup approval; otherwise retain them
  and the non-secret receipt for review.

## Required backend work

Complete the provider wiring before configuring Google Cloud:

1. Owner-isolated credential broker.
2. Google OAuth callback with state validation and offline access.
3. Encrypted refresh-token storage and revocation handling.
4. Deploy the locally verified secure research runner.
5. Implement verified Google Doc, optional Sheet, Markdown, and
   `Negroni Research` folder creation behind the filing interface.
6. Integrate the existing stable competitor boundary without enabling a
   scheduler.

The deployed backend must provide:

- `CREDENTIAL_BROKER_URL`
- `CREDENTIAL_BROKER_TOKEN`
- `LEAD_INTELLIGENCE_RUNNER_URL`
- `LEAD_INTELLIGENCE_RUNNER_TOKEN`

Store tokens and secrets only in the hosting provider's secret storage. Never
put them in chat, source, D1 research records, fixtures, or logs.

## Google Cloud setup

Complete this only after the backend supplies its exact OAuth callback URL:

1. Create a Google Cloud project named `Negroni`.
2. Enable Google Drive API, Google Docs API, and Google Sheets API.
3. Configure Google Auth Platform branding and contact details.
4. Choose the audience:
   - personal Gmail: External, Testing, with the owner's email as a test user;
   - Google Workspace: Internal when organization-only access is intended.
5. Add only `https://www.googleapis.com/auth/drive.file`.
6. Create an OAuth client with application type **Web application**.
7. Add the backend's exact HTTPS callback under Authorized redirect URIs.
8. Put the client ID and client secret directly into backend secret storage.

Official references:

- https://developers.google.com/workspace/drive/api/quickstart/nodejs
- https://developers.google.com/workspace/guides/create-credentials
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- https://developers.google.com/identity/protocols/oauth2/web-server

## Activation and verification

1. Verify the exact Sites owner account and preserved project ID.
2. Obtain approval for the exact runner deployment and Site environment diff.
3. Add the four backend values to Negroni's production runtime environment.
4. Redeploy only the preserved production project.
5. Open Negroni Settings and select **Connect Google Drive**.
6. Complete Google consent and confirm **Auto-store on**.
7. Obtain approval for the exact bounded live-proof proposal above.
8. Confirm `Negroni Research` exists in the connected Drive.
9. Run one research set.
10. Verify the Doc, optional Sheet, Markdown, five research artifacts, citations, storage
   receipts, and monitoring limitations.
11. Confirm no credentials appear in browser storage, D1 records, logs, source,
   or returned receipts.

## Next action

Obtain approval for the exact runner deployment and preserved-Site environment
diff, then reverify the owning project binding in the hosting control plane at
execution time. Do not create the Google OAuth client until the backend
callback URL is final, and do not execute the live filing proof without
separate approval for the proposal above.
