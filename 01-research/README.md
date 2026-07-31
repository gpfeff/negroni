# Phase 1: Research

Research creates the evidence base for every downstream decision. Its vertical-agnostic sequence is Market Awareness, Competitor Research, Psychographic Avatar Research, Master Research (4a), and Brand Tone (4b), all run with Gemini Deep Research. Its job is to
replace a vague request for “more leads” with a usable account of the business,
the buyer, the market, and the opportunities worth testing.

## The three Cs

### Client

The client is the business paying for the campaign. Research should establish:

- the offer, price, margin, sales process, and fulfillment capacity;
- the target geography and channels;
- what counts as a lead, a qualified lead, and a successful customer;
- brand constraints, required proof, prohibited claims, and approval owners;
- historical creative and campaign evidence;
- budget, timing, tracking readiness, and operational constraints.

### Customer

The customer is the person the client wants to acquire. Research should
establish:

- jobs, pain points, triggers, desired outcomes, and objections;
- awareness and intent stages;
- the language customers use in reviews, forums, calls, and search behavior;
- trust requirements and proof that changes a decision;
- audience segments whose needs are meaningfully different;
- the path from ad impression to qualified lead.

Customer research must not turn private or sensitive data into unsafe targeting
or reusable public fixtures.

### Competitors

Competitors are advertisers competing for the same attention, intent, or
budget. Research should establish:

- active offers, hooks, formats, calls to action, and landing-page patterns;
- recurring creative concepts and how they change over time;
- areas of message saturation and gaps Negroni can explore;
- observable longevity and variation, clearly separated from unobservable
  spend, conversion, or profitability.

The goal is to reverse-engineer patterns and opportunities, not copy ads.

### Cases, claims, or jobs

Lead-generation research must define what the client actually wants to receive:

- included and excluded case, claim, or job types;
- triggering facts, timing, severity, jurisdiction, and value drivers;
- qualification questions, disqualifiers, duplicates, and routing facts;
- the difference between a raw inquiry, qualified lead, payable event, retained
  customer or case, and successful outcome.

For legal or other regulated work, use authoritative jurisdiction-specific
sources, preserve uncertainty, and do not turn research into advice or an
eligibility promise.

### Required active-Meta competitor coverage

A full Research package requires at least 10 distinct competitors whose ads are
verified active in the requested country at research time through Meta Ad
Library or an authorized provider. Each counted competitor needs a stable
advertiser/Page identity, evidence URL or provider record, observed-active
timestamp, and bounded creative observations. Websites, Facebook Pages,
historical examples, agency claims, inactive ads, duplicates, and unverified
candidates do not count.

If live collection is unavailable, unsupported, throttled, or produces fewer
than 10 verified active advertisers, Research remains `partial` or `blocked`
with the exact shortfall and recovery action. General competitor research never
silently substitutes for this requirement.

## Inputs

- client intake;
- public market and customer evidence;
- approved first-party material;
- public competitor ads and landing pages;
- historical campaign exports when explicitly supplied;
- research scope, time limit, and evidence requirements.

## Outputs

The initial Research contract will produce:

1. `research-brief.md` — the human-readable three-C synthesis;
2. `evidence-index.json` — claims mapped to sources and confidence;
3. `opportunity-map.json` — audiences, angles, offers, and open questions;
4. `creative-brief.json` — approved inputs for Phase 2;
5. `research-receipt.json` — scope, tools, limitations, and completion state.

The approved brand revision has exactly two user-facing representations: a polished Google Doc for humans and content-equivalent Markdown stored against the brand for Draper, the Learning Core, and Creative. Both share revision, model, submitted-prompt, citation, limitation, timestamp, and SHA-256 metadata. Competitor database creation and ongoing monitoring are separate explicit opt-ins, not default deliverables.

These names define the implemented runner-side artifact contract. Phase 1
validates one SHA-256 receipt for each file before accepting a result.
`creative-brief.json` remains approval-pending until a person approves that
exact immutable revision and SHA-256. It is the only competitor-research input
Creative may consume; the collection receipt is not a sixth Research artifact.

The interface first saves a required customer profile: client/customer name,
profession or job title, company, public website or profile URL, service or
offer purchased, known competitors when available, industry/niche, and location or market
served. It then adds the lead offer or service and target age range needed to
scope the research. It generates a prefilled final prompt that the user can accept or edit. The two final representations are the master Google Doc and matching brand-scoped Markdown. An explicitly requested competitor database uses authoritative SQLite and may have a restricted Sheet or local review projection.

## Current modules

### Research intake and deliverables

[`../app/`](../app/) owns the required customer-profile intake and research scope,
owner-scoped saved research sets, provider settings, run status, strict
response validation, and output links for general lead-generation research.

### Meta Ads Intelligence

Meta Ads Intelligence is the local Meta-specific competitor-intelligence
engine. It archives public observations and supports evidence-based analysis
without claiming access to spend or conversion data. Negroni calls its stable
CLI through a server-only adapter and maps the resulting evidence into all five
Research artifacts without duplicating the engine's schema or lifecycle logic.

The provider-neutral nightly boundary is:

```text
negroni research competitors run --project <research-set-id> --mode nightly --json
```

The repository includes a sanitized two-night normalized-import fixture that
proves stable identities, append-only present/eligible-absence observations,
content versions, conservative lifecycle, duplicate-media reuse, one creative
family, `public-winner-signal-v2`, immutable receipt revisions, fake Google
readback, partial failure, and resume. It performs no network or external
mutation. Official collection, live Google publishing, and scheduling remain
blocked pending separate authorization and proof.

Experimental third-party adapter source is preserved for review, but it is not
part of the public CLI, MCP, or current collection plan. The approved direction
is the official Meta route only, beginning with a bounded read-only proof
against 2–3 real Page IDs in the intended countries. If that proof passes, one
request can scale to the 10-competitor gate; if it fails, coverage remains
blocked and normalized manual import is the only fallback in this milestone.

### User-triggered Meta UI evidence

[`../tools/meta-ad-capture-extension/`](../tools/meta-ad-capture-extension/)
provides a self-contained Chrome/Edge helper for that manual fallback. A person
opens Meta Ad Library, selects the country and Active filter, scrolls the public
results, and explicitly exports the cards still rendered in the page. The
extension does not automate scrolling, call hidden endpoints, retain browser
state, copy cookies, or export signed media URLs. It has no paid provider,
Google Sheet, Airtable, server, login, or machine-specific dependency.

Every export is schema-version 2 normalized input with direct Library-ID
evidence links, visible advertiser identity when available, and an observed
timestamp. It is permanently marked `partial`,
`pagination_complete: false`, and `coverage_complete: false`. Manual import
cannot change lifecycle, survivor, or winner evidence and does not waive the
10-active-advertiser gate. The bundled offline validator rejects completeness
claims, duplicate/invalid IDs, media URLs, non-Meta source pages, and common
credential/session parameters.

The plugin exposes a small MCP wrapper around this boundary. It supports
capability inspection, a dry-run-default competitor invocation, partial-run
resume, and immutable canonical-artifact verification. The MCP returns only
sanitized receipts and cannot publish, spend, change an account, or activate a
schedule.

It is one source inside the competitor branch of Research, not the whole
Negroni product and not an ad-account operator.

## Implemented contract and follow-on work

- Shared versioned IDs, null-plus-reason fields, lifecycle gates, projection
  state machines, and five artifact receipts are implemented.
- Keep the Meta Ads Intelligence adapter storage-neutral without weakening
  profile isolation or evidence rules.
- Require one idempotent scheduler owner and an active-or-blocked monitoring
  receipt; never infer that a requested schedule is running.
- Deploy the locally verified owner-scoped runner only after its server-side
  providers and secret store are configured and the exact deployment diff is
  approved.
- Add additional public-research adapters behind the same evidence contract.
- Add each new live provider only with its own authorization, sanitized fixture,
  bounded coverage proof, and capability receipt.

## Competitor-monitoring provider decision

Competitor monitoring is provider-neutral internally, while the selected live
plan uses only the official Meta Ad Library route. See the
[provider strategy](../docs/decisions/2026-07-29-competitor-monitoring-provider-strategy.md).

The reviewed Meta Graph API v26.0 Ads Archive boundary can return political and
issue ads globally and commercial ads that reached an EU country. It does not
return ordinary commercial ads that reached no EU location. Accordingly, US
commercial competitor collection is currently `unsupported` through that
official route; eligible EU or political collection remains `blocked` until
owner authorization and a bounded live Page-ID proof pass. Do not substitute
Foreplay, Firecrawl, BrowserOS collection, or a Cloudflare scraper. The bundled
user-triggered capture helper is a reviewed manual-import aid, not an automated
collector or proof of complete country coverage.

## Exit criteria

Research is ready for Phase 2 when a reviewer can answer:

- who the paying client or buyer is and what it accepts;
- exactly which customer segments are targeted and what evidence describes
  their situations, motivations, objections, and language;
- which claims, cases, or jobs qualify or do not qualify and what intake must
  establish;
- which 10 or more distinct competitors were verified with active Meta ads in
  the requested country at research time;

- What are we selling, to whom, and under what constraints?
- Which customer problems and messages have evidence?
- What are competitors doing, and what remains unknown?
- Which creative opportunities are original, testable, and approved?
- Can every material claim be traced to a source or labeled as a hypothesis?

## Learning Core handoff

Research writes owner-, workspace-, and brand-scoped evidence and observations.
It may create a candidate learning with explicit provenance, confidence,
applicability, limitations, and freshness. It cannot promote its own model
output to supported or trusted knowledge. The relational database is
authoritative; the private Markdown note is a generated projection.
