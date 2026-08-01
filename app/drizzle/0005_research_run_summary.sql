ALTER TABLE research_profiles ADD COLUMN latest_run_id TEXT NOT NULL DEFAULT '';
ALTER TABLE research_profiles ADD COLUMN latest_run_status TEXT NOT NULL DEFAULT '';
ALTER TABLE research_profiles ADD COLUMN latest_run_completed_at TEXT NOT NULL DEFAULT '';
ALTER TABLE research_profiles ADD COLUMN drive_folder_name TEXT NOT NULL DEFAULT '';
ALTER TABLE research_profiles ADD COLUMN drive_folder_url TEXT NOT NULL DEFAULT '';
ALTER TABLE research_profiles ADD COLUMN google_doc_url TEXT NOT NULL DEFAULT '';
ALTER TABLE research_profiles ADD COLUMN google_sheet_url TEXT NOT NULL DEFAULT '';
ALTER TABLE research_profiles ADD COLUMN markdown_filename TEXT NOT NULL DEFAULT '';
