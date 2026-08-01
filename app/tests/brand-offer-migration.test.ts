import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import test from "node:test";

test("legacy research rows become one brand and preserve profession without reusing the removed customer name", async () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE research_profiles (
      id TEXT PRIMARY KEY,
      owner_email TEXT NOT NULL,
      client_customer_name TEXT NOT NULL,
      profession_job_title TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO research_profiles
      (id, owner_email, client_customer_name, profession_job_title, updated_at)
    VALUES
      ('offer-1', 'owner@example.test', 'Removed customer name', 'HVAC owner', '2026-07-31T00:00:00.000Z');
  `);
  const migration = await readFile(resolve(process.cwd(), "drizzle/0004_brand_offer_hierarchy.sql"), "utf8");
  database.exec(migration);
  const migrated = database.prepare(`
    SELECT brand_id, profession, job_title FROM research_profiles WHERE id = 'offer-1'
  `).get() as { brand_id: string; profession: string; job_title: string };

  assert.deepEqual({ ...migrated }, {
    brand_id: "offer-1",
    profession: "HVAC owner",
    job_title: "HVAC owner",
  });
  database.close();
});

test("existing offers gain an empty durable latest-run receipt without inventing history", async () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE research_profiles (
      id TEXT PRIMARY KEY,
      owner_email TEXT NOT NULL,
      profession_job_title TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO research_profiles (id, owner_email, profession_job_title, updated_at)
    VALUES ('offer-1', 'owner@example.test', 'HVAC owner', '2026-07-31T00:00:00.000Z');
  `);
  database.exec(await readFile(resolve(process.cwd(), "drizzle/0004_brand_offer_hierarchy.sql"), "utf8"));
  database.exec(await readFile(resolve(process.cwd(), "drizzle/0005_research_run_summary.sql"), "utf8"));
  database.exec(await readFile(resolve(process.cwd(), "drizzle/0006_research_run_basis.sql"), "utf8"));
  const migrated = database.prepare(`
    SELECT latest_run_id, latest_run_status, drive_folder_url, google_doc_url,
      google_sheet_url, markdown_filename, latest_run_basis_json
    FROM research_profiles WHERE id = 'offer-1'
  `).get() as Record<string, string>;
  assert.deepEqual({ ...migrated }, {
    latest_run_id: "",
    latest_run_status: "",
    drive_folder_url: "",
    google_doc_url: "",
    google_sheet_url: "",
    markdown_filename: "",
    latest_run_basis_json: "",
  });
  database.close();
});
