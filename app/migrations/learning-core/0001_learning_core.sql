PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS learning_core_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ingestion_receipts (
  owner_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  ingestion_key TEXT NOT NULL,
  input_sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('created', 'idempotent')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, workspace_id, ingestion_key)
);

CREATE TABLE IF NOT EXISTS brands (
  owner_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, workspace_id, id)
);

CREATE TABLE IF NOT EXISTS offers (
  owner_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, workspace_id, id),
  FOREIGN KEY (owner_id, workspace_id, brand_id) REFERENCES brands(owner_id, workspace_id, id)
);

CREATE TABLE IF NOT EXISTS audiences (
  owner_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  definition TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, workspace_id, id),
  FOREIGN KEY (owner_id, workspace_id, brand_id) REFERENCES brands(owner_id, workspace_id, id)
);

CREATE TABLE IF NOT EXISTS campaigns (
  owner_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  id TEXT NOT NULL,
  offer_id TEXT,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, workspace_id, id),
  FOREIGN KEY (owner_id, workspace_id, brand_id) REFERENCES brands(owner_id, workspace_id, id)
);

CREATE TABLE IF NOT EXISTS ad_sets (
  owner_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  audience_id TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, workspace_id, id),
  FOREIGN KEY (owner_id, workspace_id, brand_id) REFERENCES brands(owner_id, workspace_id, id)
);

CREATE TABLE IF NOT EXISTS ads (
  owner_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  id TEXT NOT NULL,
  ad_set_id TEXT NOT NULL,
  name TEXT NOT NULL,
  headline TEXT NOT NULL,
  primary_text TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, workspace_id, id),
  FOREIGN KEY (owner_id, workspace_id, brand_id) REFERENCES brands(owner_id, workspace_id, id)
);

CREATE TABLE IF NOT EXISTS media_objects (
  owner_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  relative_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, workspace_id, sha256)
);

CREATE TABLE IF NOT EXISTS creative_assets (
  owner_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  id TEXT NOT NULL,
  ad_id TEXT NOT NULL,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  media_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, workspace_id, id),
  FOREIGN KEY (owner_id, workspace_id, brand_id) REFERENCES brands(owner_id, workspace_id, id),
  FOREIGN KEY (owner_id, workspace_id, media_sha256) REFERENCES media_objects(owner_id, workspace_id, sha256)
);

CREATE TABLE IF NOT EXISTS hypotheses (
  owner_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  id TEXT NOT NULL,
  statement TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, workspace_id, id),
  FOREIGN KEY (owner_id, workspace_id, brand_id) REFERENCES brands(owner_id, workspace_id, id)
);

CREATE TABLE IF NOT EXISTS experiments (
  owner_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  id TEXT NOT NULL,
  hypothesis_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned', 'running', 'completed', 'inconclusive')),
  control_ad_id TEXT NOT NULL,
  variant_ad_id TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, workspace_id, id),
  FOREIGN KEY (owner_id, workspace_id, brand_id) REFERENCES brands(owner_id, workspace_id, id)
);

CREATE TABLE IF NOT EXISTS normalized_outcomes (
  owner_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  id TEXT NOT NULL,
  experiment_id TEXT NOT NULL,
  ad_id TEXT,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  currency TEXT NOT NULL,
  spend REAL NOT NULL,
  impressions INTEGER NOT NULL,
  clicks INTEGER NOT NULL,
  conversions INTEGER NOT NULL,
  leads INTEGER NOT NULL,
  qualified_leads INTEGER NOT NULL,
  lead_quality_score REAL,
  attribution_model TEXT NOT NULL,
  freshness_as_of TEXT NOT NULL,
  source_type TEXT NOT NULL,
  fixture_only INTEGER NOT NULL CHECK (fixture_only IN (0, 1)),
  input_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, workspace_id, id),
  FOREIGN KEY (owner_id, workspace_id, brand_id) REFERENCES brands(owner_id, workspace_id, id)
);

CREATE TABLE IF NOT EXISTS evidence (
  owner_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  id TEXT NOT NULL,
  kind TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  freshness_as_of TEXT NOT NULL,
  fixture_only INTEGER NOT NULL CHECK (fixture_only IN (0, 1)),
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, workspace_id, id),
  FOREIGN KEY (owner_id, workspace_id, brand_id) REFERENCES brands(owner_id, workspace_id, id)
);

CREATE TABLE IF NOT EXISTS observations (
  owner_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  id TEXT NOT NULL,
  statement TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, workspace_id, id),
  FOREIGN KEY (owner_id, workspace_id, brand_id) REFERENCES brands(owner_id, workspace_id, id)
);

CREATE TABLE IF NOT EXISTS learnings (
  owner_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  id TEXT NOT NULL,
  current_version INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('observation', 'candidate', 'supported', 'trusted', 'contradicted', 'superseded')),
  statement TEXT NOT NULL,
  provenance TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  applicability TEXT NOT NULL,
  limitations_json TEXT NOT NULL,
  approval_state TEXT NOT NULL CHECK (approval_state IN ('not_requested', 'pending', 'approved', 'rejected')),
  supersedes_learning_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, workspace_id, id),
  FOREIGN KEY (owner_id, workspace_id, brand_id) REFERENCES brands(owner_id, workspace_id, id)
);

CREATE TABLE IF NOT EXISTS learning_versions (
  owner_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  learning_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  state TEXT NOT NULL,
  statement TEXT NOT NULL,
  provenance TEXT NOT NULL,
  confidence REAL NOT NULL,
  applicability TEXT NOT NULL,
  limitations_json TEXT NOT NULL,
  approval_state TEXT NOT NULL,
  supersedes_learning_id TEXT,
  change_reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, workspace_id, learning_id, version)
);

CREATE TRIGGER IF NOT EXISTS learning_versions_no_update
BEFORE UPDATE ON learning_versions
BEGIN
  SELECT RAISE(ABORT, 'learning versions are immutable');
END;

CREATE TRIGGER IF NOT EXISTS learning_versions_no_delete
BEFORE DELETE ON learning_versions
BEGIN
  SELECT RAISE(ABORT, 'learning versions are immutable');
END;

CREATE TABLE IF NOT EXISTS learning_evidence (
  owner_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  learning_id TEXT NOT NULL,
  learning_version INTEGER NOT NULL,
  evidence_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('support', 'counter')),
  PRIMARY KEY (owner_id, workspace_id, learning_id, learning_version, evidence_id, role)
);

CREATE VIRTUAL TABLE IF NOT EXISTS learning_fts USING fts5(
  owner_id UNINDEXED,
  workspace_id UNINDEXED,
  brand_id UNINDEXED,
  learning_id UNINDEXED,
  version UNINDEXED,
  statement,
  applicability,
  limitations,
  tokenize = 'unicode61'
);

CREATE TABLE IF NOT EXISTS vector_entries (
  owner_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  learning_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  vector_json TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  rebuilt_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, workspace_id, learning_id, version)
);

CREATE TABLE IF NOT EXISTS retrieval_receipts (
  owner_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  id TEXT NOT NULL,
  query_sha256 TEXT NOT NULL,
  strategy TEXT NOT NULL,
  token_budget INTEGER NOT NULL,
  estimated_tokens INTEGER NOT NULL,
  truncated INTEGER NOT NULL,
  match_ids_json TEXT NOT NULL,
  freshness_as_of TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, workspace_id, id)
);

CREATE TABLE IF NOT EXISTS vault_projections (
  owner_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  learning_id TEXT NOT NULL,
  learning_version INTEGER NOT NULL,
  relative_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, workspace_id, learning_id, learning_version)
);

CREATE TABLE IF NOT EXISTS human_revision_imports (
  owner_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  id TEXT NOT NULL,
  learning_id TEXT NOT NULL,
  base_version INTEGER NOT NULL,
  proposed_statement TEXT NOT NULL,
  note_sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_review', 'accepted', 'rejected')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, workspace_id, id)
);

CREATE TABLE IF NOT EXISTS proposals (
  owner_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('experiment', 'loop_policy_change')),
  summary TEXT NOT NULL,
  diff_json TEXT NOT NULL,
  proposal_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('proposed', 'approved', 'rejected')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, workspace_id, id)
);

CREATE TABLE IF NOT EXISTS decisions (
  owner_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  proposal_hash TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  approved_by TEXT NOT NULL,
  rationale TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, workspace_id, id)
);

INSERT OR IGNORE INTO learning_core_migrations(version, applied_at)
VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

PRAGMA user_version = 1;
