# PHASE 1: RESEARCH

Keep the shared `lead-generation-ads-discovery-intelligence` skill canonical.
The app owns the required customer-profile intake and research-scope questions, saved research sets, provider connection
status, run status, optional competitor database and monitoring status, strict response validation, two
final output links, versioned research-seed review, and the explicit Phase 2
handoff. Do not duplicate or weaken the skill’s method.

Keep one application route with a serious B2B SaaS shell: Home, the five-phase
sidebar, and Settings. User-facing phase labels are Research, Create, Launch,
Iterate, and Loop. Keep Home sparse: show the Research action cards and the
honest next action, while leaving phase progression in the persistent sidebar
instead of duplicating it as a second five-card pipeline. Research contains
saved sets, the required customer profile and research-scope inputs, editable five-step `1 → 2 → 3 → 4a → 4b` Gemini Deep Research sequence, run status, optional monitor
receipt, two final representations, and the interactive seed editor. Settings is the single
home for appearance, commit approvals, supported provider connections, API
keys, storage, and local setup. Do not duplicate settings in the sidebar or add
wizards, fixture runs, or synthetic publication states.

Treat each accepted seed revision as immutable. AI review returns a proposed
revision only; it must never overwrite the current seed. Applying, rejecting,
restoring, and approving are explicit user actions. Phase 2 consumes the
approved revision ID and SHA-256 fingerprint. Later edits create draft changes
without silently altering prior ads or the approved Phase 2 pointer.

A complete run executes Market Awareness, Competitor Research, Psychographic Avatar Research, Master Research (4a), and Brand Tone (4b) with Gemini Deep Research in that order. Preserve the exact editable prompt revision and return one verified, polished Google Doc plus one matching brand-scoped Markdown report with five prompt receipts. Competitor database creation and ongoing monitoring are separate opt-ins; a declined option is `not_requested`, not a blocker. A partial run requires an explicit prompt or requested-monitoring limitation.
Never fabricate IDs, URLs, schedules, watch counts, evidence, completion, or
parity.

Keep research records owner-scoped in D1 and free of secrets. OAuth tokens and
API keys belong only in the server-side credential broker; never store them in
browser storage, D1, intake, logs, fixtures, or source. Google OAuth must use
the minimum `drive.file` scope and create outputs inside the Negroni Research
folder.

External actions are limited to public research, creation of the requested
Google Doc and backend Markdown, and explicitly requested competitor persistence or monitoring. Collection
must remain authorized, public, and read-only. Never bypass controls, submit
forms, launch traffic, spend money, or mutate ad accounts.

The site must not depend on localhost, a machine-specific path, or a local
companion. Run `npm run validate` and desktop/mobile visual QA before reporting
ready.
