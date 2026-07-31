CREATE TABLE IF NOT EXISTS research_run_approvals (
  run_id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  model TEXT NOT NULL,
  scope TEXT NOT NULL,
  estimated_cost TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  PRIMARY KEY (owner_email, run_id)
);
