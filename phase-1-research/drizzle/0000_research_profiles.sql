CREATE TABLE IF NOT EXISTS research_profiles (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  offer_or_lead_type TEXT NOT NULL,
  industry TEXT NOT NULL,
  country_region TEXT NOT NULL,
  target_age_range TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS research_profiles_owner_updated_idx
ON research_profiles (owner_email, updated_at DESC);
