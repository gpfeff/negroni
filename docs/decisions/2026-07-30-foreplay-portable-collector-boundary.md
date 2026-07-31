# Portable U.S. Meta competitor collection boundary

**Status:** superseded before activation; experimental source retained
**Date:** 2026-07-30

## Superseding direction

Later on 2026-07-30, the collection plan was narrowed to the official Meta Ad
Library route only. Foreplay is not exposed through the public CLI or MCP and
is not the next live proof. No Foreplay, Firecrawl, BrowserOS collection, or
Cloudflare scraper should be used for this milestone. The preserved adapter
source and isolated fake-response tests are historical experimental work, not
authorization or a selected product dependency.

## Experimental outcome retained for reference

Negroni will own the competitor-research product and keep ad acquisition behind
a replaceable provider contract. `foreplay_api` is the first implemented
portable hosted-collector adapter for ordinary U.S. commercial Meta ads. It is
optional infrastructure, not Negroni's database, interface, research method,
or artifact format.

The adapter has no Airtable, Google Sheets, BrowserOS, Linux, Selenium, or
Claude Code dependency. It uses Foreplay's documented HTTPS API from any
supported Negroni runner. Google Sheets and Drive remain optional projections.

No Foreplay subscription was purchased, no credential was connected, and no
credit-bearing live request was made while recording this decision.

## Why the referenced Claude/Airtable repository is not the solution

The referenced repository sends Meta Ads Archive API results to Airtable and
uses Selenium to resolve creative assets. Airtable is only its output sink.
Claude Code is only the setup/operator harness. Neither changes what Meta's
upstream endpoint returns.

The repository has no coverage receipt that distinguishes a valid zero-result
scan from unsupported country coverage. Its open issue reports that extraction
works for Europe but not GCC or Levant. This is consistent with the official
Ads Archive boundary Negroni already tested: it does not provide the ordinary
U.S.-only commercial-ad coverage required here.

References:

- <https://github.com/krusemediallc/Meta-Ads-Spy-Claude-Code-Airtable>
- <https://github.com/krusemediallc/Meta-Ads-Spy-Claude-Code-Airtable/issues/1>
- <https://www.facebook.com/help/259468828226154/>

## Product ownership

Negroni owns:

- keyword-driven competitor discovery and distinct-advertiser counting;
- exact Page-ID monitoring after human verification;
- provider-neutral ad records, evidence links, and coverage receipts;
- append-only observations, content versions, lifecycle, and media deduplication;
- creative-family analysis and bounded public-durability signals;
- the 10-active-competitor Research completion gate;
- Research artifacts, review, Creative handoff, and later campaign learning;
- provider replacement without rewriting downstream research.

The evaluated collector would own only acquisition from Meta and its own
upstream availability. Foreplay supplies discovery search, Page-ID ad lookup,
live status, creative fields, cursor pagination, and a best-effort live collect
fallback through its public API.

## Implemented Foreplay contract

`app/lib/competitor-research/foreplay-provider.ts` now provides:

- active-ad discovery by keyword;
- exact Meta Page-ID collection;
- a cached lookup followed by `collect=true` only when the cached result is
  empty, matching Foreplay's documented guidance;
- bounded pagination and response sizes;
- normalized Meta ad IDs, direct Meta Ad Library evidence URLs, copy,
  headline, CTA, landing page, format, advertiser identity, and timestamps;
- distinct active-advertiser candidates for the 10-competitor gate;
- generic blocked states for HTTP 401, 402, 403, and 429 without retaining
  credentials or untrusted provider error bodies;
- reported `X-Credit-Cost` and `X-Credits-Remaining` values when supplied; and
- an explicit distinction between complete pagination of Foreplay's returned
  index and unverified completeness of the underlying Meta platform.

The stable CLI and MCP provider enums exclude `foreplay_api`. No server-side
credential connection or credit-bearing request is planned.

Foreplay documents one credit per returned ad, cursor pagination, an MCP
endpoint using the same API credential, and the relevant discovery and Page-ID
endpoints. Current pricing lists Basic at $59 per month with API access, MCP,
and 10,000 credits, or $49 per month billed annually with 20,000 credits.

References:

- <https://public.api.foreplay.co/docs>
- <https://www.foreplay.co/pricing>

## Coverage rules

A successful provider response is not automatically a complete Meta scan.

- `provider_index_pagination_complete=true` means Negroni exhausted the cursor
  returned by Foreplay inside the approved bound.
- `meta_platform_coverage_verified=false` remains false until a separate proof
  can establish platform completeness.
- The documented Foreplay discovery and Page-ID ad endpoints do not expose a
  country filter. A live Foreplay result is therefore not countable toward a
  requested-country completion gate until Page identity and country delivery
  are separately verified.
- Foreplay's documented `collect=true` fallback is always marked partial
  because Foreplay says it is best-effort and may return only the ads obtained
  within its collection window.
- HTTP blocks, malformed envelopes, repeated cursors, timeouts, and request
  bounds never become zero-ad evidence.
- Research still requires at least 10 distinct advertisers with ads observed
  active in the requested country; fewer than 10 leaves Research partial or
  blocked.

## Technical conclusion

Negroni can replace Foreplay's workflow, storage, analysis, monitoring logic,
and research interface. It cannot currently reproduce Foreplay's unattended
U.S. Meta acquisition network with the same reliability using only Meta's
official API.

A human-assisted browser saver could provide portable one-off collection, but
it would not provide unattended monitoring or historical coverage. Open-source
collectors that depend on browser-fingerprint spoofing, challenge handling, or
rotating residential proxies are not an acceptable default Negroni dependency.
They create unstable access, policy, and distribution risks and do not produce
an authoritative completeness proof.

That human-assisted fallback is now implemented as
`tools/meta-ad-capture-extension`. It is a self-contained Chrome/Edge extension
that reads only public Meta Ad Library cards already rendered after a user's
explicit click. It exports normalized schema-version 2 JSON, direct Library-ID
evidence links, the visible status and advertiser identity, the requested
country, and a collection timestamp. It deliberately excludes cookies, hidden
requests, media CDN URLs, automatic scrolling, browser persistence, and any
completeness claim. Its offline validator rejects false completeness, invalid
or duplicate IDs, media URLs, unsafe source pages, and common credential or
session parameters. The Research skill routes reviewed public-UI evidence
through this contract and keeps it partial.

Therefore, reliable unattended U.S. commercial-ad acquisition currently
requires Foreplay or another approved hosted collector if the official proof
fails as expected. The current product policy does not select one; it accepts a
blocked state or reviewed normalized manual imports instead. The provider
contract preserves the option to reverse that decision later without rewriting
downstream research.

## Archived Foreplay activation gate

This is not the current plan. Use it only if Greg explicitly reverses the
official-only decision and separately approves the credential and bounded
credit-bearing proof.

Before calling the integration usable, an approved bounded proof must:

1. connect a server-side Foreplay credential without writing it to source,
   browser storage, D1, artifacts, logs, or chat;
2. approve the exact credit-bearing test scope;
3. search the workers' compensation lawyer market and return at least 10
   distinct active-advertiser candidates with evidence links, then separately
   verify their Meta Page identities and U.S. delivery before counting them;
4. verify 2–3 approved Page IDs through cached lookup, pagination, empty-result,
   and collect-fallback cases;
5. record returned credit headers and confirm no request exceeds the declared
   ad/page bound;
6. read back normalized records and ensure no zero or complete state masks a
   provider limitation; and
7. leave scheduling disabled until a separate scheduler-owner approval and
   first-run readback.

The adapter remains experimental source. Live U.S. competitor coverage remains
blocked under the selected official-only policy. The new user-triggered helper
can produce reviewed one-off evidence, but its selectors still require a live
user-session proof against current Meta markup and it cannot provide unattended
monitoring or historical coverage.
