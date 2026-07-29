# Google Drive production setup

## Current state

- Production UI: https://lead-intelligence-workbench.g-pfeffer.chatgpt.site
- Google Drive OAuth and automatic filing are implemented in the UI and API boundary.
- Production has no credential-broker or research-runner configuration.
- Google Drive and research actions therefore remain visibly blocked.

## Required backend work

Build and deploy the backend before configuring Google Cloud:

1. Owner-isolated credential broker.
2. Google OAuth callback with state validation and offline access.
3. Encrypted refresh-token storage and revocation handling.
4. Secure research runner.
5. Verified Google Doc, Sheet, Markdown, and `Negroni Research` folder creation.
6. Integration with the existing Meta Ads adapter.

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

1. Add the four backend values to Negroni's production runtime environment.
2. Redeploy the saved production version.
3. Open Negroni Settings and select **Connect Google Drive**.
4. Complete Google consent and confirm **Auto-store on**.
5. Confirm `Negroni Research` exists in the connected Drive.
6. Run one research set.
7. Verify the Doc, Sheet, Markdown, five research artifacts, citations, storage
   receipts, and monitoring limitations.
8. Confirm no credentials appear in browser storage, D1 records, logs, source,
   or returned receipts.

## Next action

Build and deploy the credential broker and research runner. Do not create the
Google OAuth client until the backend callback URL is final.
