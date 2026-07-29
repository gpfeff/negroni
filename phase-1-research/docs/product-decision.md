# Product decision

The product uses one route with two compact tabs.

Research asks only for the lead offer or service, industry, country or region,
and target age range. The authenticated user can save each combination as a
durable research set. The secure runner executes the approved five-prompt
sequence and creates five durable Research artifacts. The page retains exactly
three outward actions: one Google Doc, one matching Markdown report, and one
competitor archive action. The archive opens a restricted Google Sheet when
configured, otherwise an access-controlled local report.

Settings connects Codex OAuth, Gemini API, and Google Workspace OAuth through a
server-side credential broker. Secret values never enter browser storage or
the research-record database. Google uses the minimum `drive.file` scope and a
dedicated Negroni Research folder.

The same research run sends its verified Page-ID watchlist to the runner-side
Meta Ads Intelligence adapter. Its scheduler-neutral daily operation refreshes
the isolated SQLite archive and optional Sheet projection. Scheduler ownership
is separate, explicit, and limited to one owner per profile.

Missing secure execution, database storage, credential-broker access, or
authorized competitor collection becomes a visible blocker. Missing Google
projection preserves local collection and reports and is labeled “Google
publishing not configured.” It never becomes invented data or a synthetic
success state.
