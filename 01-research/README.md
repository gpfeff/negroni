# Phase 1: Research

Research creates the evidence base for every downstream decision. Its job is to
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

These names define the implemented runner-side artifact contract. Phase 1
validates one SHA-256 receipt for each file before accepting a result.

The interface saves reusable combinations of lead offer or service, industry,
country or region, and target age range. It keeps three outward actions: the
master Google Doc, matching Markdown, and competitor archive. The archive opens
a restricted Google Sheet when configured, otherwise an access-controlled
local report. SQLite remains authoritative.

## Current modules

### Research intake and deliverables

[`../app/`](../app/) owns the four-field intake,
owner-scoped saved research sets, provider settings, run status, strict
response validation, and output links for general lead-generation research.

### Meta Ads Intelligence

Meta Ads Intelligence is the local Meta-specific competitor-intelligence
engine. It archives public observations and supports evidence-based analysis
without claiming access to spend or conversion data. Negroni calls its stable
CLI through a server-only adapter and maps the resulting evidence into all five
Research artifacts without duplicating the engine's schema or lifecycle logic.

It is one source inside the competitor branch of Research, not the whole
Negroni product and not an ad-account operator.

## Initial build plan

- Define shared research-set, client, customer, competitor, evidence, and
  source identifiers.
- Preserve the five implemented Research artifact receipts.
- Keep the implemented Meta Ads Intelligence adapter storage-neutral without
  weakening profile isolation or evidence rules.
- Require one idempotent scheduler owner and an active-or-blocked monitoring
  receipt; never infer that a requested schedule is running.
- Add additional public-research adapters behind the same evidence contract.
- Create one sanitized end-to-end fixture that produces a Creative-ready brief.
- Add contract tests for citations, unknown states, provenance, and private-data
  leakage.

## Exit criteria

Research is ready for Phase 2 when a reviewer can answer:

- What are we selling, to whom, and under what constraints?
- Which customer problems and messages have evidence?
- What are competitors doing, and what remains unknown?
- Which creative opportunities are original, testable, and approved?
- Can every material claim be traced to a source or labeled as a hypothesis?
