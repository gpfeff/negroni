# PHASE 1: RESEARCH

A focused Negroni interface for saving a reusable research set, running the
five approved research prompts in order, and producing:

1. Google Doc — complete master research report
2. Markdown — portable report matching the Google Doc
3. Google Sheet — authoritative competitor-ad archive

The Research tab asks only:

- Lead offer or service
- Industry
- Country or region
- Target age range

Each authenticated user can save, reopen, update, and delete combinations of
those inputs. Records are owner-scoped in the site database. The app never puts
provider credentials in those records.

The five-prompt source is the approved Google Doc
`1lbwCUUeJnqung5JZJwJGVq-20u3UOgMqaaqMYUcrb9o` and the sequence is fixed:
Market Awareness, Competitor Research, Avatar/Psychographic Research, Master
Research, and Tone of Voice. The secure runner must return a receipt for every
prompt.

After competitor research verifies a watchlist, the runner configures Meta Ads
Intelligence to refresh the same Google Sheet nightly at 02:17 in the intake
timezone. The UI shows the real schedule receipt or exact blocker.

## Settings and secrets

Settings provides:

- Codex OAuth
- Gemini API key
- Google Workspace OAuth with the minimum `drive.file` scope

OAuth and API-key material must be stored only by a secure server-side
credential broker. The Gemini key is sent directly to that broker and cleared
from the form. Negroni does not persist secret values in the browser, site
database, repository, logs, or research payload.

Google OAuth uses the web-server authorization-code flow with offline access.
The broker verifies OAuth state, stores refresh tokens securely, and creates or
reuses one app-owned `Negroni Research` folder. Each connected owner's Doc,
Sheet, and matching Markdown file are filed there automatically. The app
forwards only the authenticated owner identity to the broker and runner.

Configure these server-side values in the hosting environment:

- `LEAD_INTELLIGENCE_RUNNER_URL`
- `LEAD_INTELLIGENCE_RUNNER_TOKEN`
- `CREDENTIAL_BROKER_URL`
- `CREDENTIAL_BROKER_TOKEN`

Without the runner and verified Google connection, research is visibly blocked.
Without the credential broker, Settings is visibly blocked. The app never
falls back to fixtures or invents Google IDs, output URLs, research findings,
or monitoring state.

The connector follows Google's narrow-scope and server-side token guidance:
[Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
and
[OAuth for web-server apps](https://developers.google.com/identity/protocols/oauth2/web-server).

The exact runner and monitoring requirements are in
[`docs/runner-contract.md`](docs/runner-contract.md).

## Commands

```bash
npm install
npm run dev
npm run validate
npm run qa:visual
```

Dependencies are runtime state and should live outside the synced Documents
tree.
