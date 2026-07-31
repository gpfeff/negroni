# Product decision

Negroni is plugin-first. Users install the Negroni plugin in ChatGPT or Codex,
work through portable phase skills, and use an owner-scoped live Site for
campaign data, artifacts, review, and approvals. The React code in this
directory implements that Site; it is not a separate standalone product.

The plugin is the distribution layer, skills are the procedural layer, and
stable Negroni tool contracts are the live-data/action layer. Gemini and other
compatible agent packages should reuse the same phase skills and tool contracts
rather than fork campaign behavior.

The Site uses one route with compact workspace views.

Research first asks for client/customer name, profession or job title, company,
public website or profile URL, service or offer purchased, competitor used,
industry/niche, and location or market served. It then asks for the lead offer
or service and target age range needed to scope the research. The authenticated user can save each combination as a
durable research set. The secure runner executes the approved five-prompt
sequence and creates five durable Research artifacts. The page retains exactly
three outward actions: one Google Doc, one matching Markdown report, and one
competitor archive action. The archive opens a restricted Google Sheet when
configured, otherwise an access-controlled local report.

Each saved set also opens an interactive, versioned Markdown seed. The owner
can edit it, record disagreements and context, discuss changes with a
configured review runner, and explicitly apply or reject proposals. One
revision is approved for Phase 2 with a content fingerprint. Later edits do not
silently change that pointer or any ads already derived from it.

Settings reflects Codex/ChatGPT, Gemini, media-provider, and Google Workspace
readiness through a server-side credential broker. Secret values never enter
browser storage or the research-record database. Google uses the minimum
`drive.file` scope and a dedicated Negroni Research folder.

The same research run sends its verified Page-ID watchlist to the runner-side
Meta Ads Intelligence adapter. Its scheduler-neutral daily operation refreshes
the isolated SQLite archive and optional Sheet projection. Scheduler ownership
is separate, explicit, and limited to one owner per profile.

Missing secure execution, database storage, credential-broker access, or
authorized competitor collection becomes a visible blocker. Missing Google
projection preserves local collection and reports and is labeled “Google
publishing not configured.” It never becomes invented data or a synthetic
success state.

The in-app seed is the canonical Phase 2 input after approval. Run-time Google
Doc, Markdown, and competitor archive outputs are evidence snapshots; edited
seed revisions do not claim those exports were synchronized.

The local launcher and SSH path remain supported for contributors and optional
self-hosting. They are not the default onboarding or customer experience.
