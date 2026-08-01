ALTER TABLE research_profiles ADD COLUMN brand_id TEXT NOT NULL DEFAULT '';
ALTER TABLE research_profiles ADD COLUMN profession TEXT NOT NULL DEFAULT '';
ALTER TABLE research_profiles ADD COLUMN job_title TEXT NOT NULL DEFAULT '';
UPDATE research_profiles SET brand_id = id WHERE brand_id = '';
UPDATE research_profiles SET profession = profession_job_title WHERE profession = '';
UPDATE research_profiles SET job_title = profession_job_title WHERE job_title = '';
CREATE INDEX IF NOT EXISTS research_profiles_brand_updated_idx
ON research_profiles (owner_email, brand_id, updated_at DESC);
