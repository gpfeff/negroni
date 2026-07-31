import type { Database } from "../database.ts";
import { GEMINI_DEEP_RESEARCH_AGENT } from "./gemini-deep-research.ts";

export const RESEARCH_SCOPE = "Five-step Research sequence (1 -> 2 -> 3 -> 4a -> 4b)";
export const RESEARCH_COST = "Provider pricing applies; exact cost is not available locally";
export const APPROVAL_TTL_MS = 10 * 60 * 1000;

export type Approval = {
  run_id: string;
  owner: string;
  model: typeof GEMINI_DEEP_RESEARCH_AGENT;
  scope: typeof RESEARCH_SCOPE;
  estimated_cost: typeof RESEARCH_COST;
  approved_at: string;
  expires_at: string;
};

export interface ApprovalStore {
  create(approval: Approval): Promise<boolean>;
  consume(owner: string, runId: string, now: string): Promise<Approval | null>;
}

export class InMemoryApprovalStore implements ApprovalStore {
  readonly #values = new Map<string, Approval>();
  readonly #locks = new Map<string, Promise<void>>();

  async create(approval: Approval): Promise<boolean> {
    const key = `${approval.owner}:${approval.run_id}`;
    if (this.#values.has(key)) return false;
    this.#values.set(key, approval);
    return true;
  }

  async consume(owner: string, runId: string, now: string): Promise<Approval | null> {
    const key = `${owner}:${runId}`;
    const prior = this.#locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    this.#locks.set(key, prior.then(() => current));
    await prior;
    try {
      const approval = this.#values.get(key);
      if (!approval || approval.expires_at <= now) {
        if (approval) this.#values.delete(key);
        return null;
      }
      this.#values.delete(key);
      return approval;
    } finally {
      release();
      if (this.#locks.get(key) === current) this.#locks.delete(key);
    }
  }
}

export const CREATE_RESEARCH_RUN_APPROVALS = `
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
  )
`;

export class D1ApprovalStore implements ApprovalStore {
  constructor(private readonly database: Database) {}

  async create(approval: Approval): Promise<boolean> {
    await this.database.prepare(CREATE_RESEARCH_RUN_APPROVALS).run();
    const result = await this.database.prepare(`
      INSERT OR IGNORE INTO research_run_approvals
        (run_id, owner_email, model, scope, estimated_cost, approved_at, expires_at, consumed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
    `).bind(approval.run_id, approval.owner, approval.model, approval.scope, approval.estimated_cost, approval.approved_at, approval.expires_at).run();
    return result.meta?.changes === 1;
  }

  async consume(owner: string, runId: string, now: string): Promise<Approval | null> {
    await this.database.prepare(CREATE_RESEARCH_RUN_APPROVALS).run();
    const claimed = await this.database.prepare(`
      UPDATE research_run_approvals SET consumed_at = ?
      WHERE owner_email = ? AND run_id = ? AND consumed_at IS NULL AND expires_at > ?
    `).bind(now, owner, runId, now).run();
    if (claimed.meta?.changes !== 1) return null;
    const rows = await this.database.prepare(`
      SELECT run_id, owner_email AS owner, model, scope, estimated_cost, approved_at, expires_at
      FROM research_run_approvals WHERE owner_email = ? AND run_id = ? AND consumed_at = ?
    `).bind(owner, runId, now).all<Approval>();
    return rows.results?.[0] ?? null;
  }
}

export function createResearchApprovalService(store: ApprovalStore, now = () => new Date()) {
  return {
    async approve(owner: string, runId: string): Promise<Approval> {
      if (!/^run_[a-f0-9]{24}$/.test(runId)) throw new Error("A valid exact run ID is required.");
      const approvedAt = now();
      const approval: Approval = {
        run_id: runId,
        owner,
        model: GEMINI_DEEP_RESEARCH_AGENT,
        scope: RESEARCH_SCOPE,
        estimated_cost: RESEARCH_COST,
        approved_at: approvedAt.toISOString(),
        expires_at: new Date(approvedAt.getTime() + APPROVAL_TTL_MS).toISOString(),
      };
      if (!await store.create(approval)) throw new Error("This exact run ID already has an approval record.");
      return approval;
    },
    async authorizeStart(owner: string, runId: string, connected: boolean): Promise<Approval> {
      if (!connected) throw new Error("Gemini is not connected.");
      const approval = await store.consume(owner, runId, now().toISOString());
      if (!approval) throw new Error("Approval is missing, expired, already used, or does not match this exact run ID.");
      if (approval.model !== GEMINI_DEEP_RESEARCH_AGENT || approval.scope !== RESEARCH_SCOPE) throw new Error("Approval metadata is invalid.");
      return approval;
    },
  };
}
