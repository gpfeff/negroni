export const LEARNING_STATES = [
  "observation",
  "candidate",
  "supported",
  "trusted",
  "contradicted",
  "superseded",
] as const;

export type LearningState = (typeof LEARNING_STATES)[number];
export type ApprovalState = "not_requested" | "pending" | "approved" | "rejected";

export type LearningScope = {
  owner_id: string;
  workspace_id: string;
  brand_id: string;
};

export type EvidenceReceipt = {
  evidence_id: string;
  kind: "catalog" | "experiment" | "outcome" | "research" | "decision";
  source_type: string;
  source_ref: string;
  sha256: string;
  observed_at: string;
  freshness_as_of: string;
  fixture_only: boolean;
};

export type LearningRecord = LearningScope & {
  learning_id: string;
  version: number;
  state: LearningState;
  statement: string;
  provenance: string;
  confidence: number;
  applicability: string;
  limitations: string[];
  approval_state: ApprovalState;
  supporting_evidence: EvidenceReceipt[];
  counterevidence: EvidenceReceipt[];
  created_at: string;
  updated_at: string;
  supersedes_learning_id: string | null;
};

export type RetrievalMatch = {
  learning_id: string;
  version: number;
  state: LearningState;
  statement: string;
  confidence: number;
  applicability: string;
  limitations: string[];
  score: number;
};

export type RetrievalReceipt = LearningScope & {
  receipt_id: string;
  query: string;
  strategy: "fts5" | "fts5_plus_vector";
  token_budget: number;
  estimated_tokens: number;
  truncated: boolean;
  matches: RetrievalMatch[];
  freshness_as_of: string | null;
  created_at: string;
};

export const DRAPER_INTENTS = [
  "inspect_brand",
  "search_ads",
  "compare_creatives",
  "analyze_performance",
  "explain_loop_state",
  "retrieve_learnings",
  "inspect_data_gaps",
  "propose_experiment",
  "propose_loop_policy_change",
  "prepare_change_diff",
] as const;

export type DraperIntent = (typeof DRAPER_INTENTS)[number];

export type DraperProposal = {
  proposal_id: string;
  proposal_hash: string;
  kind: "experiment" | "loop_policy_change";
  status: "proposed" | "approved" | "rejected";
  summary: string;
  diff: Array<{ field: string; before: string | null; after: string }>;
  approval_required: true;
};

export type DraperResponse = {
  contract: "negroni-draper-response";
  contract_version: "1.0";
  intent: DraperIntent;
  answer: string;
  scope: LearningScope;
  freshness: {
    as_of: string | null;
    status: "fresh" | "stale" | "missing" | "fixture_only";
  };
  evidence: EvidenceReceipt[];
  learnings: RetrievalMatch[];
  assumptions: string[];
  limitations: string[];
  proposals: DraperProposal[];
  completed_actions: Array<never>;
  external_actions: Array<never>;
};

export type WarehouseMeasurement = LearningScope & {
  outcome_id: string;
  experiment_id: string;
  ad_id: string | null;
  period_start: string;
  period_end: string;
  currency: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  leads: number;
  qualified_leads: number;
  lead_quality_score: number | null;
  attribution_model: string;
  freshness_as_of: string;
  source_type: string;
  fixture_only: boolean;
};

export interface WarehouseAdapter {
  readonly name: string;
  load(scope: LearningScope): Promise<WarehouseMeasurement[]>;
}

export type LearningCoreRuntimeOptions = {
  runtimeRoot?: string;
  databasePath?: string;
  now?: () => string;
};

type CatalogRecord = { id: string; name: string };

export type LearningCoreFixture = {
  fixture_id: string;
  fixture_only: true;
  scope: LearningScope;
  brand: CatalogRecord & { description: string };
  offers: Array<CatalogRecord & { description: string; status: string }>;
  audiences: Array<CatalogRecord & { definition: string }>;
  campaigns: Array<CatalogRecord & { offer_id: string; platform: string; status: string }>;
  ad_sets: Array<CatalogRecord & { campaign_id: string; audience_id: string; status: string }>;
  ads: Array<CatalogRecord & {
    ad_set_id: string;
    headline: string;
    primary_text: string;
    status: string;
  }>;
  creative_assets: Array<CatalogRecord & {
    ad_id: string;
    asset_type: string;
    mime_type: string;
    media_content: string;
  }>;
  hypotheses: Array<{ id: string; statement: string; status: string }>;
  experiments: Array<{
    id: string;
    hypothesis_id: string;
    name: string;
    status: "planned" | "running" | "completed" | "inconclusive";
    control_ad_id: string;
    variant_ad_id: string;
    started_at: string;
    ended_at: string;
  }>;
  outcomes: WarehouseMeasurement[];
  evidence: Array<EvidenceReceipt & { metadata: Record<string, unknown> }>;
  observation: {
    observation_id: string;
    statement: string;
    evidence_id: string;
  };
  learning: {
    learning_id: string;
    state: "candidate";
    statement: string;
    provenance: string;
    confidence: number;
    applicability: string;
    limitations: string[];
    approval_state: "not_requested" | "pending";
    supporting_evidence_ids: string[];
  };
  next_experiment: {
    summary: string;
    field: string;
    before: string;
    after: string;
  };
};

const STABLE_ID = /^[a-z][a-z0-9_-]{2,127}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export function assertStableId(value: unknown, label: string): string {
  if (typeof value !== "string" || !STABLE_ID.test(value)) {
    throw new Error(`${label} must be a stable lowercase identifier.`);
  }
  return value;
}

export function assertTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !ISO_TIMESTAMP.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO-8601 UTC timestamp.`);
  }
  return value;
}

export function assertText(value: unknown, label: string, maximum = 8_000): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maximum) {
    throw new Error(`${label} must contain 1 through ${maximum} characters.`);
  }
  if (/\0/.test(value)) throw new Error(`${label} contains a forbidden null byte.`);
  return value.trim();
}

export function assertScope(value: unknown): LearningScope {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("scope must be an object.");
  }
  const scope = value as Record<string, unknown>;
  const keys = Object.keys(scope);
  if (keys.some((key) => !["owner_id", "workspace_id", "brand_id"].includes(key))) {
    throw new Error("scope contains an unsupported field.");
  }
  return {
    owner_id: assertStableId(scope.owner_id, "owner_id"),
    workspace_id: assertStableId(scope.workspace_id, "workspace_id"),
    brand_id: assertStableId(scope.brand_id, "brand_id"),
  };
}

export function assertConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("confidence must be a number from 0 through 1.");
  }
  return value;
}

export function assertTokenBudget(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 64 || Number(value) > 4_000) {
    throw new Error("token_budget must be an integer from 64 through 4000.");
  }
  return Number(value);
}

export function assertExactObject(
  value: unknown,
  allowed: readonly string[],
  required: readonly string[] = [],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("input must be an object.");
  }
  const record = value as Record<string, unknown>;
  const unsupported = Object.keys(record).find((key) => !allowed.includes(key));
  if (unsupported) throw new Error(`Unsupported input: ${unsupported}.`);
  const missing = required.find((key) => !(key in record));
  if (missing) throw new Error(`Required input is missing: ${missing}.`);
  return record;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
