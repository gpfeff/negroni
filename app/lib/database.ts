import {
  CREATE_RESEARCH_MESSAGES,
  CREATE_RESEARCH_MESSAGES_PROFILE_INDEX,
  CREATE_RESEARCH_PROFILES,
  CREATE_RESEARCH_PROFILES_BRAND_INDEX,
  CREATE_RESEARCH_PROFILES_OWNER_INDEX,
  CREATE_RESEARCH_REVISIONS,
  CREATE_RESEARCH_REVISIONS_PROFILE_INDEX,
  CREATE_RESEARCH_WORKSPACES,
  CREATE_RESEARCH_WORKSPACES_OWNER_INDEX,
} from "@/db/schema";

type D1RunResult = { success: boolean; meta?: { changes?: number } };
type D1AllResult<T> = { success: boolean; results?: T[] };
type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<D1RunResult>;
  all<T>(): Promise<D1AllResult<T>>;
};
export type Database = {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<D1RunResult[]>;
};
const schemaPromises = new WeakMap<Database, Promise<void>>();

const RESEARCH_PROFILE_CONTEXT_COLUMNS = [
  ["brand_id", "TEXT NOT NULL DEFAULT ''"],
  ["profession", "TEXT NOT NULL DEFAULT ''"],
  ["job_title", "TEXT NOT NULL DEFAULT ''"],
  ["company_name", "TEXT NOT NULL DEFAULT ''"],
  ["website_or_public_profile_url", "TEXT NOT NULL DEFAULT ''"],
  ["competitor_used", "TEXT NOT NULL DEFAULT ''"],
  ["latest_run_id", "TEXT NOT NULL DEFAULT ''"],
  ["latest_run_status", "TEXT NOT NULL DEFAULT ''"],
  ["latest_run_completed_at", "TEXT NOT NULL DEFAULT ''"],
  ["drive_folder_name", "TEXT NOT NULL DEFAULT ''"],
  ["drive_folder_url", "TEXT NOT NULL DEFAULT ''"],
  ["google_doc_url", "TEXT NOT NULL DEFAULT ''"],
  ["google_sheet_url", "TEXT NOT NULL DEFAULT ''"],
  ["markdown_filename", "TEXT NOT NULL DEFAULT ''"],
  ["latest_run_basis_json", "TEXT NOT NULL DEFAULT ''"],
] as const;

export async function getDatabase(): Promise<Database | null> {
  try {
    // Cloudflare exposes bindings through this runtime-only module.
    // @ts-expect-error cloudflare:workers is provided by the deployed Worker runtime.
    const workers = await import("cloudflare:workers") as { env?: { DB?: Database } };
    return workers.env?.DB ?? null;
  } catch {
    return null;
  }
}

export async function ensureResearchSchema(database: Database): Promise<void> {
  const existing = schemaPromises.get(database);
  if (existing) return existing;
  const pending = ensureResearchSchemaOnce(database).catch((error) => {
    schemaPromises.delete(database);
    throw error;
  });
  schemaPromises.set(database, pending);
  await pending;
}

async function ensureResearchSchemaOnce(database: Database): Promise<void> {
  await database.batch([
    database.prepare(CREATE_RESEARCH_PROFILES),
    database.prepare(CREATE_RESEARCH_PROFILES_OWNER_INDEX),
    database.prepare(CREATE_RESEARCH_WORKSPACES),
    database.prepare(CREATE_RESEARCH_REVISIONS),
    database.prepare(CREATE_RESEARCH_MESSAGES),
    database.prepare(CREATE_RESEARCH_WORKSPACES_OWNER_INDEX),
    database.prepare(CREATE_RESEARCH_REVISIONS_PROFILE_INDEX),
    database.prepare(CREATE_RESEARCH_MESSAGES_PROFILE_INDEX),
  ]);
  const columns = await database.prepare("PRAGMA table_info(research_profiles)").all<{ name: string }>();
  const existing = new Set((columns.results ?? []).map(({ name }) => name));
  const additions = RESEARCH_PROFILE_CONTEXT_COLUMNS
    .filter(([name]) => !existing.has(name))
    .map(([name, definition]) => database.prepare(`ALTER TABLE research_profiles ADD COLUMN ${name} ${definition}`));
  if (additions.length) await database.batch(additions);
  await database.prepare("UPDATE research_profiles SET brand_id = id WHERE brand_id = ''").run();
  if (existing.has("profession_job_title")) {
    await database.batch([
      database.prepare("UPDATE research_profiles SET profession = profession_job_title WHERE profession = ''"),
      database.prepare("UPDATE research_profiles SET job_title = profession_job_title WHERE job_title = ''"),
    ]);
  }
  await database.prepare(CREATE_RESEARCH_PROFILES_BRAND_INDEX).run();
}
