import assert from "node:assert/strict";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import test from "node:test";
import { ensureResearchSchema, type Database } from "@/lib/database";
import { createEmptyIntake } from "@/lib/intelligence/defaults";
import type { RunResult } from "@/lib/intelligence/contracts";
import { listResearchProfiles, persistResearchRunSummary } from "@/lib/research-profiles";

function sqliteDatabase(): { database: Database; close(): void } {
  const sqlite = new DatabaseSync(":memory:");
  class Statement {
    values: unknown[] = [];
    constructor(readonly sql: string) {}
    bind(...values: unknown[]) { this.values = values; return this; }
    async run() {
      const result = sqlite.prepare(this.sql).run(...this.values as SQLInputValue[]);
      return { success: true, meta: { changes: Number(result.changes) } };
    }
    async all<T>() {
      return { success: true, results: sqlite.prepare(this.sql).all(...this.values as SQLInputValue[]) as T[] };
    }
  }
  const database: Database = {
    prepare(sql: string) { return new Statement(sql); },
    async batch(statements) {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  };
  return { database, close: () => sqlite.close() };
}

function verifiedResult(): RunResult {
  return {
    run_id: "run_0123456789abcdef01234567",
    status: "partial",
    completed_at: "2026-07-31T22:00:00.000Z",
    brand_library: {
      status: "stored",
      folder_name: "Negroni / Regional Repair Co. / Emergency HVAC leads",
      folder_url: "https://drive.google.com/drive/folders/folder-123",
      verified: true,
    },
    outputs: {
      google_doc: { title: "Master Research", url: "https://docs.google.com/document/d/doc-123/edit", verified: true },
      google_sheet: { title: "Competitor Database", status: "published", url: "https://docs.google.com/spreadsheets/d/sheet-123/edit", verified: true },
      markdown: { filename: "emergency-hvac-leads-master-research.md", content: "# Research", mime_type: "text/markdown" },
    },
  } as RunResult;
}

test("a verified run receipt persists against the exact offer and survives profile reload", async () => {
  const { database, close } = sqliteDatabase();
  try {
    const intake = createEmptyIntake("America/Los_Angeles");
    Object.assign(intake, {
      profession: "HVAC contractor",
      job_title: "Operations director",
      company_name: "Regional Repair Co.",
      website_or_public_profile_url: "https://regional-repair.example",
      competitor_used: "Repair Marketplace",
      offer_or_lead_type: "Emergency HVAC leads",
      industry: "Home services",
      country_region: "Phoenix, Arizona",
      target_age_range: "30–60",
    });
    await ensureResearchSchema(database);
    await database.prepare(`
      INSERT INTO research_profiles (
        id, brand_id, owner_email, profession, job_title, company_name,
        website_or_public_profile_url, competitor_used, offer_or_lead_type,
        industry, country_region, target_age_range, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      "offer-1", "brand-1", "owner@example.test", intake.profession,
      intake.job_title, intake.company_name, intake.website_or_public_profile_url,
      intake.competitor_used, intake.offer_or_lead_type, intake.industry,
      intake.country_region, intake.target_age_range,
      "2026-07-31T20:00:00.000Z", "2026-07-31T20:00:00.000Z",
    ).run();

    await persistResearchRunSummary(database, "owner@example.test", "offer-1", intake, verifiedResult());
    const profiles = await listResearchProfiles(database, "owner@example.test");
    assert.equal(profiles.length, 1);
    assert.deepEqual(profiles[0]?.latest_run, {
      run_id: "run_0123456789abcdef01234567",
      status: "partial",
      completed_at: "2026-07-31T22:00:00.000Z",
      folder_name: "Negroni / Regional Repair Co. / Emergency HVAC leads",
      folder_url: "https://drive.google.com/drive/folders/folder-123",
      google_doc_url: "https://docs.google.com/document/d/doc-123/edit",
      google_sheet_url: "https://docs.google.com/spreadsheets/d/sheet-123/edit",
      markdown_filename: "emergency-hvac-leads-master-research.md",
      is_current: true,
    });

    await database.prepare("UPDATE research_profiles SET offer_or_lead_type = ? WHERE id = ?")
      .bind("A materially changed offer", "offer-1").run();
    const changedOffer = await listResearchProfiles(database, "owner@example.test");
    assert.equal(changedOffer[0]?.latest_run?.is_current, false);
    assert.equal(changedOffer[0]?.latest_run?.run_id, "run_0123456789abcdef01234567");

    await database.prepare("UPDATE research_profiles SET offer_or_lead_type = ? WHERE id = ?")
      .bind(intake.offer_or_lead_type, "offer-1").run();

    const changed = { ...intake, offer_or_lead_type: "A different offer" };
    await assert.rejects(
      persistResearchRunSummary(database, "owner@example.test", "offer-1", changed, verifiedResult()),
      /does not match the saved offer/,
    );

    await database.prepare("UPDATE research_profiles SET drive_folder_url = ? WHERE id = ?")
      .bind("javascript:alert(1)", "offer-1").run();
    const corrupted = await listResearchProfiles(database, "owner@example.test");
    assert.equal(corrupted[0]?.latest_run, null);
  } finally {
    close();
  }
});
