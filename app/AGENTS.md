# PHASE 1: RESEARCH

Keep the shared `lead-generation-ads-discovery-intelligence` skill canonical.
The app owns the permanent brand foundation, offer-scoped research packages,
provider connection status, minimal run status, the single optional competitor
database control, strict response validation, verified output links, versioned
research-seed review, and the explicit Phase 2 handoff. Do not duplicate or
weaken the skill’s method.

Keep one application route with a serious B2B SaaS shell: Home, the five-phase
sidebar, Tools, and Settings. User-facing phase labels are Research, Create,
Launch, Iterate, and Loop. Keep Home sparse: show the Research action cards and
the honest next action, while leaving phase progression in the persistent
sidebar instead of duplicating it as a second five-card pipeline. Research
shows Create brand, the complete brand-and-offer intake, one optional Create
customer competitor database control, minimal run status, verified outputs,
and the interactive seed editor. The internal five-step `1 → 2 → 3 → 4a → 4b`
Gemini sequence is canonical but does not occupy the primary form. Tools →
Integrations is the home for provider connections, API keys, storage, and local
setup. Settings contains only appearance and commit-approval preferences. Do
not add wizards, fixture runs, or synthetic publication states.

Treat the brand file as permanent shared research. Company name, public
website/profile, industry, and location belong to the brand. Each brand may
have multiple offers; profession, job title, known competitors, lead offer or
service, and optional target age belong to the current offer. Keep exactly one
current versioned research package for each offer so materially different
offers never mix their research.

Treat each accepted seed revision as immutable. AI review returns a proposed
revision only; it must never overwrite the current seed. Applying, rejecting,
restoring, and approving are explicit user actions. Phase 2 consumes the
approved revision ID and SHA-256 fingerprint. Later edits create draft changes
without silently altering prior ads or the approved Phase 2 pointer.

A complete run executes Market Awareness, Competitor Research, Psychographic Avatar Research, Master Research (4a), and Brand Tone (4b) with Gemini Deep Research in that order. Preserve the exact submitted prompt revision and return one verified, polished Google Doc plus one matching brand-scoped Markdown report with five prompt receipts. Create customer competitor database is the only user-facing optional action. When declined, database collection is `not_requested` and does not block the core package. Continuous monitoring is not a second control and no scheduler is installed by this flow. A partial run requires an explicit prompt or requested-database limitation.
Never fabricate IDs, URLs, schedules, watch counts, evidence, completion, or
parity.

Keep research records owner-scoped in D1 and free of secrets. OAuth tokens and
API keys belong only in the server-side credential broker; never store them in
browser storage, D1, intake, logs, fixtures, or source. Google OAuth must use
the minimum `drive.file` scope and create outputs inside the private
`Negroni / <Brand> / <Offer>` hierarchy.

External actions are limited to public research, creation of the requested
Google Doc and backend Markdown, and explicitly requested competitor-database persistence. Collection
must remain authorized, public, and read-only. Never bypass controls, submit
forms, launch traffic, spend money, or mutate ad accounts.

The site must not depend on localhost, a machine-specific path, or a local
companion. Run `npm run validate` and desktop/mobile visual QA before reporting
ready.
