export const CREATE_RESEARCH_PROFILES = `
  CREATE TABLE IF NOT EXISTS research_profiles (
    id TEXT PRIMARY KEY,
    owner_email TEXT NOT NULL,
    client_customer_name TEXT NOT NULL,
    profession_job_title TEXT NOT NULL,
    company_name TEXT NOT NULL,
    website_or_public_profile_url TEXT NOT NULL,
    service_or_offer_purchased TEXT NOT NULL,
    competitor_used TEXT NOT NULL,
    offer_or_lead_type TEXT NOT NULL,
    industry TEXT NOT NULL,
    country_region TEXT NOT NULL,
    target_age_range TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

export const CREATE_RESEARCH_PROFILES_OWNER_INDEX = `
  CREATE INDEX IF NOT EXISTS research_profiles_owner_updated_idx
  ON research_profiles (owner_email, updated_at DESC)
`;

export const CREATE_RESEARCH_WORKSPACES = `
  CREATE TABLE IF NOT EXISTS research_workspaces (
    profile_id TEXT PRIMARY KEY,
    owner_email TEXT NOT NULL,
    status TEXT NOT NULL,
    current_revision_id TEXT,
    approved_revision_id TEXT,
    approved_seed_sha256 TEXT,
    latest_run_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

export const CREATE_RESEARCH_REVISIONS = `
  CREATE TABLE IF NOT EXISTS research_revisions (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    owner_email TEXT NOT NULL,
    revision_number INTEGER NOT NULL,
    parent_revision_id TEXT,
    origin TEXT NOT NULL,
    status TEXT NOT NULL,
    markdown_content TEXT NOT NULL,
    change_summary TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(profile_id, revision_number)
  )
`;

export const CREATE_RESEARCH_MESSAGES = `
  CREATE TABLE IF NOT EXISTS research_messages (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    owner_email TEXT NOT NULL,
    role TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL,
    proposed_revision_id TEXT,
    created_at TEXT NOT NULL
  )
`;

export const CREATE_RESEARCH_WORKSPACES_OWNER_INDEX = `
  CREATE INDEX IF NOT EXISTS research_workspaces_owner_updated_idx
  ON research_workspaces (owner_email, updated_at DESC)
`;

export const CREATE_RESEARCH_REVISIONS_PROFILE_INDEX = `
  CREATE INDEX IF NOT EXISTS research_revisions_profile_number_idx
  ON research_revisions (profile_id, revision_number DESC)
`;

export const CREATE_RESEARCH_MESSAGES_PROFILE_INDEX = `
  CREATE INDEX IF NOT EXISTS research_messages_profile_created_idx
  ON research_messages (profile_id, created_at ASC)
`;
