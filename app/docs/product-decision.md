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

Research first creates a permanent brand file from the complete initial
intake. One brand can hold multiple offers, and each offer has one current
versioned research package. Target age is optional. The primary page shows the
brand and offer information, one optional customer competitor database choice,
and run status; the internal research-stage and prompt details do not clutter
the form. The secure runner still executes the approved five-prompt
sequence and creates five durable Research artifacts. A completed run exposes
the verified Drive folder and Google Doc; the matching Markdown remains a
durable representation. If the competitor database was selected, its verified
restricted Google Sheet also appears. Declining it does not create an archive
or block Research.

Each offer package also opens an interactive, versioned Markdown seed. The owner
can edit it, record disagreements and context, discuss changes with a
configured review runner, and explicitly apply or reject proposals. One
revision is approved for Phase 2 with a content fingerprint. Later edits do not
silently change that pointer or any ads already derived from it.

Tools → Integrations reflects Codex/ChatGPT, Gemini, media-provider, and Google
Workspace readiness through a server-side credential broker. Settings is
limited to appearance and approval preferences. Secret values never enter
browser storage or the research-record database. Google uses the minimum
`drive.file` scope and a dedicated `Negroni / <Brand> / <Offer>` hierarchy.
A completed run exposes its Drive link only from a verified filing receipt.
The latest compact receipt and exact intake basis are stored owner-scoped
against the offer and read back on reload; another offer cannot inherit or
display it. If shared brand or offer information changes, the old package is
preserved and marked as needing refresh. Stable IDs keep the Drive brand and
offer folders attached to the same records across display-name changes.

Brands are grouped by permanent `brand_id`, not by offer record. A Brand detail
page shows its shared foundation, offers, and honest Research, Creative,
Campaign, and Learning counts. Library defaults to a real brand and offer, then
filters real Drive-backed outputs by offer, asset type, platform, status, and
date. Each result shows its offer and research-run provenance. Unknown history
remains zero rather than becoming a synthetic count.

When the competitor database is selected, the research run sends its verified
Page-ID evidence to the runner-side Meta Ads Intelligence adapter and creates a
verified Sheet projection for the current offer. This is the only optional
Research control. Continuous monitoring remains a separate future/internal
capability and this flow does not create or claim a scheduler.

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
