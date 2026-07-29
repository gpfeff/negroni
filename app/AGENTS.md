# PHASE 1: RESEARCH

Keep the shared `lead-generation-ads-discovery-intelligence` skill canonical.
The app owns the four-field intake, saved research sets, provider connection
status, run and nightly-monitor status, strict response validation, three
output links, versioned research-seed review, and the explicit Phase 2
handoff. Do not duplicate or weaken the skill’s method.

Keep one application route with a serious B2B SaaS shell: Home, the five-phase
sidebar, and Settings. User-facing phase labels are Research, Create, Launch,
Iterate, and Loop. Home shows campaign state, phase progression, agent
readiness, artifact handoffs, and the honest next action. Research contains
saved sets, the four required inputs, five-prompt sequence, run status, monitor
receipt, three outputs, and the interactive seed editor. Settings contains only
supported provider connections. Do not add wizards, fixture runs, or synthetic
publication states.

Treat each accepted seed revision as immutable. AI review returns a proposed
revision only; it must never overwrite the current seed. Applying, rejecting,
restoring, and approving are explicit user actions. Phase 2 consumes the
approved revision ID and SHA-256 fingerprint. Later edits create draft changes
without silently altering prior ads or the approved Phase 2 pointer.

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
