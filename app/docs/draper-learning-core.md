# Draper and Learning Core

Draper is Negroni's conversational agent under Tools. The Learning Core is the shared, brand-scoped evidence and retrieval system behind Draper and all five phases.

## Stable boundaries

```text
Natural-language question
  -> Draper validated intent
  -> LearningCoreStorage
       -> SQLite relational catalog (authoritative)
       -> FTS5 retrieval and receipts
       -> replaceable vector index (non-authoritative)
       -> generated Markdown vault projection
  -> evidence-backed answer or reviewable proposal
```

The warehouse boundary is `WarehouseAdapter`. The first implementation is `FixtureWarehouseAdapter`; it never calls an advertising platform. The storage boundary is `LearningCoreStorage`. The first implementation is local SQLite; a PostgreSQL adapter can implement the same methods later.

## Catalog and evidence

Migration `migrations/learning-core/0001_learning_core.sql` creates the relational catalog for brands, offers, audiences, campaigns, ad sets, ads, creative assets, hypotheses, experiments, and normalized outcomes. It also creates evidence, observations, current learnings, immutable learning versions, support/counterevidence links, FTS5, disposable vector entries, retrieval receipts, vault projections, human revision imports, proposals, and decisions.

Every lookup is bounded by `owner_id`, `workspace_id`, and `brand_id`. The database is authoritative. Large media bytes are written to SHA-256 content-addressed files; rows contain no media blob.

## Learning lifecycle

Allowed forward transitions are:

- observation to candidate;
- candidate to supported;
- supported to trusted;
- observation, candidate, supported, or trusted to contradicted when counterevidence exists; and
- supported or trusted to superseded when a replacement learning is named.

Supported and trusted promotions require explicit approval and evidence. Each transition appends a database-trigger-protected immutable version. Unsupported claims remain observations or candidates.

## Vault behavior

Generated notes live in the private runtime vault and use YAML frontmatter plus Obsidian wiki links. They declare `generated: true` and `authoritative: false`. Reprojection checks the previous file hash. A direct human edit blocks overwrite. A human-authored revision must declare its scope, target learning, and base version; a valid import becomes `pending_review` and does not mutate the learning.

## Draper tools

- `learning_core_status` reports schema, integrity, storage, retrieval mode, and bounded counts without paths.
- `draper_query` supports brand inspection, ad search, creative comparison, performance analysis, Loop explanation, learning retrieval, data-gap review, experiment proposals, Loop-policy proposals, and reviewable diffs.
- `draper_record_decision` records an approval or rejection for the exact proposal hash. It executes nothing externally.

The stable local CLI is:

```text
negroni draper status --json
negroni draper query --json                 # one bounded JSON object on stdin
negroni draper record-decision --json       # one bounded JSON object on stdin
negroni draper fixture rehearse --json
```

No Draper command accepts raw SQL, provider credentials, filesystem paths from the browser, live spend instructions, or arbitrary shell commands.

## Fixture vertical slice

The sanitized Desert Ember HVAC fixture creates three ads and creative assets, one hypothesis, one simulated experiment, two normalized outcomes, two evidence receipts, one observation, and one candidate learning. It projects and indexes the learning, then answers “How is this brand's loop doing?” with a simulated $80 versus $100 qualified-CPL comparison, fixture freshness, limitations, and a proposed controlled follow-up. It performs zero external actions.

## Runtime and deployment status

Local runtime data belongs under the machine-local Negroni data root. The hosted Site shows Draper under Tools but does not read a Mac-local database from the browser. Live warehouse adapters, PostgreSQL, hosted persistence, production deployment, continuous ingestion, and advertising-account actions are not implemented by this milestone.

See the architecture decision at [`../../docs/decisions/2026-07-30-draper-learning-core-architecture.md`](../../docs/decisions/2026-07-30-draper-learning-core-architecture.md).
