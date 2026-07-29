# PHASE 1: RESEARCH

Keep the shared `lead-generation-ads-discovery-intelligence` skill canonical.
The app owns the four-field intake, saved research sets, provider connection
status, run and nightly-monitor status, strict response validation, and three
output links. Do not duplicate or weaken the skill’s method.

Keep the interface compact: one route with Research and Settings tabs. Research
contains saved sets, the four required inputs, five-prompt sequence, run status,
monitor receipt, and three outputs. Settings contains only supported provider
connections. Do not add dashboards, sidebars, wizards, evidence workbenches,
fixture runs, or synthetic publication states.

A complete run must execute the five prompts from source document
`1lbwCUUeJnqung5JZJwJGVq-20u3UOgMqaaqMYUcrb9o` in the declared order and
return exactly one verified Google Doc, one verified Google Sheet, one matching
Markdown report, five prompt receipts, and an active nightly competitor-monitor
receipt. A partial run requires an explicit prompt or monitoring limitation.
Never fabricate IDs, URLs, schedules, watch counts, evidence, completion, or
parity.

Keep research records owner-scoped in D1 and free of secrets. OAuth tokens and
API keys belong only in the server-side credential broker; never store them in
browser storage, D1, intake, logs, fixtures, or source. Google OAuth must use
the minimum `drive.file` scope and create outputs inside the Negroni Research
folder.

External actions are limited to public research, creation of the requested
Google Doc and Sheet, and the requested nightly competitor monitor. Collection
must remain authorized, public, and read-only. Never bypass controls, submit
forms, launch traffic, spend money, or mutate ad accounts.

The site must not depend on localhost, a machine-specific path, or a local
companion. Run `npm run validate` and desktop/mobile visual QA before reporting
ready.
