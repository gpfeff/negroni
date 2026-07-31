# ADR: Draper and the central Learning Core

- Status: Accepted for the local fixture milestone
- Date: 2026-07-30
- Scope: General Negroni plugin and all five phase contracts

## Context

Negroni needs one durable place to connect what Research observes, what Creative proposes, what Launch prepares, what Iteration measures, and what Loop learns. A conversational agent also needs a safe way to answer campaign questions without inventing SQL, mixing brands, or turning model output into truth.

The first milestone must work locally without advertising credentials, warehouse credentials, live accounts, or a production deployment. It must remain portable across Codex, Hermes, and other compatible harnesses.

## Decision

Negroni has three connected planes behind stable TypeScript and CLI/MCP contracts.

### Data plane

The relational catalog records brands, offers, audiences, campaigns, ad sets, ads, creative assets, hypotheses, experiments, and normalized outcomes. A `WarehouseAdapter` supplies spend, delivery, conversions, leads, qualified leads, lead quality, attribution, and freshness. The checked-in adapter reads sanitized fixtures only.

### Knowledge plane

`LearningCoreStorage` is the stable storage contract. `LearningCoreStore` implements it with machine-local SQLite. SQLite is authoritative because it can enforce scope, uniqueness, immutable history, transactions, integrity checks, and deterministic recovery in one local file. A future PostgreSQL adapter may implement the same contract without changing Draper or phase behavior.

SQLite FTS5 provides dependable local full-text retrieval. The vector index is a separate replaceable interface and is explicitly non-authoritative: it can be cleared and rebuilt from current database records. Losing the vector table cannot lose a learning.

Large media bytes stay in content-addressed files keyed by SHA-256. Database rows keep only the hash, bounded metadata, and a relative content key. The Obsidian-compatible Markdown vault is generated from database versions with stable IDs, YAML frontmatter, wiki links, scope, provenance, confidence, evidence, and freshness. It is a readable projection, not another source of truth. A changed generated note blocks reprojection until it enters the validated human-revision workflow, which records a pending proposal rather than silently rewriting the database.

The learning lifecycle is:

`observation -> candidate -> supported -> trusted -> contradicted or superseded`

Promotion is sequential and explicit. `supported` and `trusted` require recorded evidence and approval. Contradiction requires counterevidence. Every state change creates an immutable version; no model response can promote itself.

### Control plane

Draper is the conversational control plane because the marketer should ask normal questions rather than operate databases. Draper maps a question to one of ten bounded intents, retrieves only the supplied owner/workspace/brand scope, and returns evidence, scope, freshness, assumptions, limitations, and proposed diffs. It exposes no generic SQL or command tool.

Recommendations, proposals, decisions, and external actions are separate states. Draper may record an approval or rejection against an exact proposal ID and SHA-256. That local decision does not publish, spend, launch traffic, change a budget, activate a scheduler, or mutate an ad account. Those actions remain behind Launch's exact-diff approval boundary.

## Runtime ownership

- Repository source, migrations, schemas, sanitized fixtures, tests, and docs stay in the Negroni repository.
- Private SQLite, vector entries, media, logs, and vault notes stay under the machine-local Negroni runtime.
- Durable non-secret review packets may be written to the governed Documents tools workspace.
- Browser and MCP responses never include credentials, private runtime paths, or raw database access.

## Consequences

- The fixture vertical slice is usable and testable without live credentials.
- The database and immutable versions prevent competing truth sources.
- Vault notes remain pleasant to read in Obsidian while preserving governance.
- Full-text retrieval works when vector search is disabled or rebuilt.
- PostgreSQL and live warehouse work are adapter milestones, not migrations of Draper's public contract.
- SQLite in Node 22 is still marked experimental by Node and must be monitored before a production-runtime commitment.
- This decision does not prove live warehouse ingestion, continuous learning, hosted persistence, ad-account connectivity, or production deployment.
