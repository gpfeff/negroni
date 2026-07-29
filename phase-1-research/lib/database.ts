import {
  CREATE_RESEARCH_MESSAGES,
  CREATE_RESEARCH_MESSAGES_PROFILE_INDEX,
  CREATE_RESEARCH_PROFILES,
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
}
