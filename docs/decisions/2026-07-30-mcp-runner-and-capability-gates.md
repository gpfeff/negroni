# Decision: expose narrow local tools and preserve live capability gates

Date: 2026-07-30

Amended: 2026-07-30 to add Draper and Learning Core tools behind the same
fail-closed boundary.

## Decision

Negroni initially exposed four cache-portable MCP tools that wrap the existing
stable competitor CLI and canonical artifact receipts. The Draper/Learning Core
vertical slice adds three local tools, for seven total, without widening the
live-action boundary. Negroni also ships the smallest owner-scoped HTTP
research-runner boundary, an official Meta capability classifier, and a
deterministic non-installed schedule plan.

None of these local boundaries implies a hosted runner, Google filing access,
official competitor collection, or an active schedule.

## MCP boundary

- `capability_status`
- `competitor_research`, dry-run by default
- `resume_competitor_research`
- `inspect_research_artifact`
- `learning_core_status`
- `draper_query`
- `draper_record_decision`

The MCP has strict schemas, serialized calls, bounded deadlines, and sanitized
receipts. Draper accepts bounded intents rather than arbitrary SQL and records
decisions separately from execution. The MCP does not expose arbitrary
commands, raw process output, private paths, credentials, publishing, spend,
account mutation, traffic launch, or scheduler activation. Competitor work
always crosses the stable `negroni research competitors run` boundary.

## Runner boundary

The local runner authenticates a bearer service token and opaque owner key,
retrieves the approved prompt source server-side, enforces the exact five
prompts, treats retrieved content as untrusted, resumes from prompt
checkpoints, validates exactly five canonical artifacts, and writes immutable
SHA-256 receipts. Default providers fail closed. Fake providers are test proof
only.

## External capability classification

- Hosted Site: `live readback verified; control-plane binding partial`; the
  production URL returned the Negroni interface and expected page title on
  2026-07-30, the repository still names project
  `appgprj_6a69601f2d3881919387445a11ad4a5b`, and the active ChatGPT browser
  session identifies Greg Pfeffer Pro. The public response does not expose the
  owning project binding, so any environment mutation or deployment still
  requires a fresh hosting control-plane identity readback and exact approval.
- Google filing: `blocked`; the connected Drive identity is
  `greg.a.pfeffer@gmail.com`, but Negroni's owner-scoped `drive.file` grant,
  callback, folder authority, and live readback are unverified.
- Official Meta for ordinary non-EU commercial ads: `unsupported`; Graph API
  v26.0 documents that non-EU ads are returned only for political/issue scope.
- Official Meta for political/issue ads or EU-reached commercial ads:
  `blocked` pending owner authorization and a bounded live proof against 2–3
  approved Page IDs. The endpoint accepts up to 10 Page IDs per request, so
  competitor count is not the current constraint; coverage is.
- Scheduler: `locally verified but not installed`; activation remains a
  separate approval-gated external action.

No scraping or paid collector is substituted automatically.

## Official evidence reviewed

- [Meta Graph API v26.0 Ads Archive](https://developers.facebook.com/docs/graph-api/reference/ads_archive/)
- [Meta Graph API v26.0 Archived Ad fields](https://developers.facebook.com/docs/graph-api/reference/archived-ad/)
- [Meta DSA transparency expansion](https://about.fb.com/news/2023/08/new-features-and-additional-transparency-measures-as-the-digital-services-act-comes-into-effect/)
