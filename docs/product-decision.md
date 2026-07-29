# Product decision

The product uses one route with two compact tabs.

Research asks only for the lead offer or service, industry, country or region,
and target age range. The authenticated user can save each combination as a
durable research set. The secure runner executes the approved five-prompt
sequence and creates exactly one Google Doc, one matching Markdown report, and
one competitor-ad Google Sheet.

Settings connects Codex OAuth, Gemini API, and Google Workspace OAuth through a
server-side credential broker. Secret values never enter browser storage or
the research-record database. Google uses the minimum `drive.file` scope and a
dedicated Negroni Research folder.

The same research run sends its verified competitor watchlist to the runner-side
Meta Ads Intelligence adapter. One idempotent job refreshes the isolated
archive and same competitor Sheet nightly at 02:17 in the intake timezone.

Missing secure execution, Google publishing, database storage, credential
broker access, or authorized competitor collection becomes a visible blocker.
It never becomes invented data or a synthetic success state.
