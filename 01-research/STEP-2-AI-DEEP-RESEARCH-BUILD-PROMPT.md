# Negroni Phase 1 build prompt — Step 2 AI Deep Research

Build Negroni Phase 1: Research around Step #2, “AI Deep Research,” from the
Pay Per Lead Nation Pro `$250K/mo Playbook`.

## Authoritative references

1. Course archive:
   `/home/greg/Documents/projects/pay-per-call/research/pay-per-lead-nation-pro-archive-2026-07-27/ppln-pro-nonpremium-index-2026-07-27.json`
2. Live prompt document:
   `https://docs.google.com/document/d/14br040WrvdALhP2Ru7njUD_AIkJi7sRBpBY_1bpAhX0`
3. Existing canonical Negroni research skill:
   `/home/greg/Documents/skills/lead-generation-ads-discovery-intelligence/SKILL.md`
4. Existing Negroni Research implementation:
   `/home/greg/Documents/tools/negroni/phase-1-research/`

## Product decision

Phase 1 should be a very simple intake → research → deliverables interface. Do
not build a dashboard, wizard, evidence workbench, project-management system,
or multiple application routes.

The research workflow should follow the structure of Step #2:

1. Market Awareness Research
2. Competitor Research
3. Customer/Avatar Psychographic Research
4. Master Marketing Intelligence synthesis

Use the course material as a structural and methodological reference. Do not
copy its protected examples, niche conclusions, claims, or branded course
content into Negroni source code or public fixtures.

## Research scope

The system must research and clearly separate:

- the client/business, offer, economics, geography, constraints, qualification
  rules, and objectives;
- the B2B lead buyer or organization receiving the leads;
- the B2C customer or end consumer becoming the lead;
- market awareness stages, observable language, triggers, beliefs, objections,
  trust requirements, and desired outcomes;
- competitors, their public ads, offers, hooks, formats, landing pages,
  funnels, qualification steps, and visible claims;
- original messaging, positioning, and creative opportunities supported by the
  evidence.

Never invent market sizes, awareness percentages, customer quotations,
competitor performance, targeting, spend, profitability, or lead quality.
Label facts, inferences, hypotheses, recommendations, conflicts, limitations,
and unknowns separately. Material claims must retain citations.

## Interface

The page should contain only:

1. Intake
   - project name;
   - one large field for everything currently known;
   - optional structured details and attachments;
   - unknown and `research this` states;
   - one Run Research button.
2. Run status
   - not started, researching, complete, partial, blocked, or failed;
   - exact blockers and limitations;
   - nightly competitor-monitoring status.
3. Outputs
   - master research Google Doc;
   - matching Markdown report;
   - competitor-ad Google Sheet.

## Research engine

The application is only the thin client and validation boundary. The canonical
`lead-generation-ads-discovery-intelligence` skill remains the research engine.
Do not duplicate the methodology inside React components or browser code.

The secure runner must execute the canonical skill, create the deliverables,
read them back, verify parity, and return a deterministic receipt. Credentials
must remain server-side.

## Nightly competitor monitoring

After the initial research identifies and verifies competitors, create a
project-specific watchlist for the existing Meta Ads Intelligence engine:

`/home/greg/Documents/tools/meta-ads-intelligence/`

A single approved background scheduler should refresh those competitors
nightly and update the same authoritative competitor archive and Google Sheet.
Do not create competing schedulers.

Nightly collection must:

- use only authorized public or official collection routes;
- preserve first-seen, last-seen, active/inactive, advertiser, creative, copy,
  CTA, destination, format, and evidence metadata;
- record complete, partial, blocked, suspect, zero-result, and failed runs
  honestly;
- never infer performance from visibility, longevity, or creative volume;
- never automate Meta UI collection without a documented authorization basis;
- produce a durable run receipt and visible blocker when collection cannot run.

## Validation

A successful initial run must verify:

- canonical skill identity;
- only approved public-research and file-creation actions;
- complete client, buyer, customer, and competitor coverage or explicit
  limitations;
- citation integrity;
- Google Doc readback;
- Google Sheet readback;
- Markdown/Doc parity;
- competitor-row provenance;
- secret scanning;
- structural-example leak scanning;
- exact output names and types;
- nightly monitoring configuration or an explicit monitoring blocker.

## Known source limitation

The five Step #2 lesson records and linked prompt document are available. The
five corresponding video files and transcripts are not currently stored
locally. Do not claim that their transcripts were reviewed. The attached
example PDFs and DOCX files are represented by archive metadata but were not
captured locally.

## Implementation requirements

Preserve Negroni’s five-phase model and existing safety boundaries. Update the
relevant Research README whenever contracts change. Keep vendor-specific
integrations behind stable adapters. Run the narrowest relevant tests, then
`npm run validate` and desktop/mobile visual QA. Report exact changed files,
checks, blockers, and remaining risks.
