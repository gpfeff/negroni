import { createHash, randomUUID } from "node:crypto";
import { accessSync, chmodSync, constants, copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { backup, DatabaseSync } from "node:sqlite";
import { assertNoSecretMaterial } from "../contracts/secrets-core.mjs";

import {
  assertConfidence,
  assertScope,
  assertStableId,
  assertText,
  assertTimestamp,
  canonicalJson,
  type ApprovalState,
  type EvidenceReceipt,
  type LearningCoreFixture,
  type LearningCoreRuntimeOptions,
  type LearningRecord,
  type LearningScope,
  type LearningState,
  type RetrievalMatch,
  type RetrievalReceipt,
  type WarehouseMeasurement,
} from "./contracts.ts";
import { ContentAddressedMediaStore, type StoredMedia } from "./media-store.ts";
import type { LearningCoreStorage } from "./storage.ts";
import type { VectorDocument, VectorRepository } from "./vector-index.ts";

type SqlRow = Record<string, unknown>;

export type FixtureIngestionReceipt = {
  ingestion_key: string;
  input_sha256: string;
  status: "created" | "idempotent";
  media: StoredMedia[];
};

const MIGRATION_PATH = fileURLToPath(
  new URL("../../migrations/learning-core/0001_learning_core.sql", import.meta.url),
);

function stringValue(row: SqlRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new Error(`Database value ${key} is invalid.`);
  return value;
}

function nullableString(row: SqlRow, key: string): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`Database value ${key} is invalid.`);
  return value;
}

function numberValue(row: SqlRow, key: string): number {
  const value = row[key];
  if (typeof value !== "number" && typeof value !== "bigint") {
    throw new Error(`Database value ${key} is invalid.`);
  }
  return Number(value);
}

function jsonArray(row: SqlRow, key: string): string[] {
  const parsed: unknown = JSON.parse(stringValue(row, key));
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error(`Database value ${key} is invalid.`);
  }
  return parsed;
}

function changeCount(value: number | bigint): number {
  return Number(value);
}

function boundedIds(values: string[], label: string): string[] {
  if (values.length > 100) throw new Error(`${label} list is too large.`);
  return [...new Set(values.map((value) => assertStableId(value, label)))];
}

function defaultRuntimeRoot(): string {
  const parent = process.env.NEGRONI_RUNTIME_ROOT
    ? resolve(process.env.NEGRONI_RUNTIME_ROOT)
    : resolve(homedir(), ".local/share/negroni");
  return resolve(parent, "learning-core");
}

function exactScope(scope: LearningScope): LearningScope {
  return assertScope({
    owner_id: scope.owner_id,
    workspace_id: scope.workspace_id,
    brand_id: scope.brand_id,
  });
}

function scopeParams(scope: LearningScope): [string, string, string] {
  const checked = exactScope(scope);
  return [checked.owner_id, checked.workspace_id, checked.brand_id];
}

function evidenceFromRow(row: SqlRow): EvidenceReceipt {
  return {
    evidence_id: stringValue(row, "id"),
    kind: stringValue(row, "kind") as EvidenceReceipt["kind"],
    source_type: stringValue(row, "source_type"),
    source_ref: stringValue(row, "source_ref"),
    sha256: stringValue(row, "content_sha256"),
    observed_at: stringValue(row, "observed_at"),
    freshness_as_of: stringValue(row, "freshness_as_of"),
    fixture_only: numberValue(row, "fixture_only") === 1,
  };
}

export class LearningCoreStore implements LearningCoreStorage, VectorRepository {
  readonly #database: DatabaseSync;
  readonly #now: () => string;
  readonly runtimeRoot: string;
  readonly databasePath: string;
  readonly vaultRoot: string;
  readonly mediaRoot: string;
  readonly media: ContentAddressedMediaStore;
  #closed = false;

  private constructor(options: LearningCoreRuntimeOptions = {}) {
    this.#now = options.now ?? (() => new Date().toISOString());
    this.runtimeRoot = options.runtimeRoot ? resolve(options.runtimeRoot) : defaultRuntimeRoot();
    this.databasePath = options.databasePath
      ? resolve(options.databasePath)
      : resolve(this.runtimeRoot, "learning-core.sqlite");
    this.vaultRoot = resolve(this.runtimeRoot, "vault");
    this.mediaRoot = resolve(this.runtimeRoot, "media");
    mkdirSync(dirname(this.databasePath), { recursive: true, mode: 0o700 });
    mkdirSync(this.vaultRoot, { recursive: true, mode: 0o700 });
    mkdirSync(this.mediaRoot, { recursive: true, mode: 0o700 });
    this.#database = new DatabaseSync(this.databasePath, {
      enableForeignKeyConstraints: true,
      allowExtension: false,
    });
    chmodSync(this.databasePath, 0o600);
    this.#database.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;");
    this.#database.exec(readFileSync(MIGRATION_PATH, "utf8"));
    this.media = new ContentAddressedMediaStore(this.mediaRoot);
  }

  static open(options: LearningCoreRuntimeOptions = {}): LearningCoreStore {
    return new LearningCoreStore(options);
  }

  now(): string {
    return assertTimestamp(this.#now(), "now");
  }

  close(): void {
    if (this.#closed) return;
    this.#database.close();
    this.#closed = true;
  }

  integrityCheck(): { ok: boolean; result: string } {
    const row = this.#database.prepare("PRAGMA integrity_check").get() as SqlRow | undefined;
    const result = row ? stringValue(row, "integrity_check") : "missing";
    return { ok: result === "ok", result };
  }

  status(): {
    contract: "negroni-learning-core-status";
    contract_version: "1.0";
    state: "ready" | "integrity_failed";
    schema_version: number;
    storage: "sqlite";
    full_text: "fts5";
    vector_index: "rebuildable_non_authoritative";
    authoritative_source: "relational_database";
    counts: {
      brands: number;
      ads: number;
      learnings: number;
      learning_versions: number;
      outcomes: number;
      vector_entries: number;
      vault_projections: number;
    };
    fixture_only: boolean;
    prohibited_actions: string[];
  } {
    const integrity = this.integrityCheck();
    const versionRow = this.#database.prepare("PRAGMA user_version").get() as SqlRow | undefined;
    const count = (table: "brands" | "ads" | "learnings" | "learning_versions" | "normalized_outcomes" | "vector_entries" | "vault_projections") => {
      const row = this.#database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as SqlRow | undefined;
      return row ? numberValue(row, "count") : 0;
    };
    const outcomes = count("normalized_outcomes");
    const nonFixture = this.#database.prepare(`
      SELECT COUNT(*) AS count FROM normalized_outcomes WHERE fixture_only = 0
    `).get() as SqlRow | undefined;
    return {
      contract: "negroni-learning-core-status",
      contract_version: "1.0",
      state: integrity.ok ? "ready" : "integrity_failed",
      schema_version: versionRow ? numberValue(versionRow, "user_version") : 0,
      storage: "sqlite",
      full_text: "fts5",
      vector_index: "rebuildable_non_authoritative",
      authoritative_source: "relational_database",
      counts: {
        brands: count("brands"),
        ads: count("ads"),
        learnings: count("learnings"),
        learning_versions: count("learning_versions"),
        outcomes,
        vector_entries: count("vector_entries"),
        vault_projections: count("vault_projections"),
      },
      fixture_only: outcomes > 0 && (nonFixture ? numberValue(nonFixture, "count") === 0 : true),
      prohibited_actions: ["publish", "spend", "launch_traffic", "change_budget", "mutate_ad_account"],
    };
  }

  async backup(destination: string): Promise<{ sha256: string; byte_size: number }> {
    const target = resolve(destination);
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    try {
      accessSync(target, constants.F_OK);
      throw new Error("Backup destination already exists; refusing to overwrite it.");
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
    }
    await backup(this.#database, target);
    chmodSync(target, 0o600);
    const bytes = readFileSync(target);
    return {
      sha256: createHash("sha256").update(bytes).digest("hex"),
      byte_size: bytes.byteLength,
    };
  }

  static restoreBackup(source: string, destination: string): { ok: true; sha256: string } {
    const backupPath = resolve(source);
    const destinationPath = resolve(destination);
    try {
      accessSync(destinationPath, constants.F_OK);
      throw new Error("Restore destination already exists; refusing to overwrite it.");
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
    }
    const sourceDatabase = new DatabaseSync(backupPath, { readOnly: true, allowExtension: false });
    try {
      const row = sourceDatabase.prepare("PRAGMA integrity_check").get() as SqlRow | undefined;
      if (!row || stringValue(row, "integrity_check") !== "ok") {
        throw new Error("Backup integrity check failed.");
      }
    } finally {
      sourceDatabase.close();
    }
    mkdirSync(dirname(destinationPath), { recursive: true, mode: 0o700 });
    copyFileSync(backupPath, destinationPath, constants.COPYFILE_EXCL);
    chmodSync(destinationPath, 0o600);
    const bytes = readFileSync(destinationPath);
    return { ok: true, sha256: createHash("sha256").update(bytes).digest("hex") };
  }

  async ingestFixture(fixture: LearningCoreFixture): Promise<FixtureIngestionReceipt> {
    if (!fixture || fixture.fixture_only !== true) throw new Error("Only explicit sanitized fixtures are accepted here.");
    assertNoSecretMaterial(fixture, "Learning Core fixture");
    const scope = exactScope(fixture.scope);
    if (fixture.brand.id !== scope.brand_id) throw new Error("Fixture brand does not match its scope.");
    const ingestionKey = assertStableId(fixture.fixture_id, "fixture_id");
    const inputSha256 = createHash("sha256").update(canonicalJson(fixture)).digest("hex");
    const existing = this.#database.prepare(`
      SELECT input_sha256 FROM ingestion_receipts
      WHERE owner_id = ? AND workspace_id = ? AND ingestion_key = ?
    `).get(scope.owner_id, scope.workspace_id, ingestionKey) as SqlRow | undefined;
    if (existing) {
      if (stringValue(existing, "input_sha256") !== inputSha256) {
        throw new Error("Idempotency key was reused with different fixture content.");
      }
      return { ingestion_key: ingestionKey, input_sha256: inputSha256, status: "idempotent", media: [] };
    }

    const storedMedia: StoredMedia[] = [];
    for (const asset of fixture.creative_assets) {
      storedMedia.push(await this.media.put(Buffer.from(asset.media_content, "utf8"), asset.mime_type));
    }

    const now = this.now();
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      this.#database.prepare(`
        INSERT INTO brands(owner_id, workspace_id, id, name, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(scope.owner_id, scope.workspace_id, assertStableId(fixture.brand.id, "brand.id"),
        assertText(fixture.brand.name, "brand.name", 240), assertText(fixture.brand.description, "brand.description"), now, now);

      for (const offer of fixture.offers) {
        this.#database.prepare(`INSERT INTO offers VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(scope.owner_id, scope.workspace_id, scope.brand_id, assertStableId(offer.id, "offer.id"),
            assertText(offer.name, "offer.name", 240), assertText(offer.description, "offer.description"),
            assertText(offer.status, "offer.status", 80), now);
      }
      for (const audience of fixture.audiences) {
        this.#database.prepare(`INSERT INTO audiences VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(scope.owner_id, scope.workspace_id, scope.brand_id, assertStableId(audience.id, "audience.id"),
            assertText(audience.name, "audience.name", 240), assertText(audience.definition, "audience.definition"), now);
      }
      for (const campaign of fixture.campaigns) {
        this.#database.prepare(`INSERT INTO campaigns VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(scope.owner_id, scope.workspace_id, scope.brand_id, assertStableId(campaign.id, "campaign.id"),
            assertStableId(campaign.offer_id, "campaign.offer_id"), assertText(campaign.name, "campaign.name", 240),
            assertText(campaign.platform, "campaign.platform", 80), assertText(campaign.status, "campaign.status", 80), now);
      }
      for (const adSet of fixture.ad_sets) {
        this.#database.prepare(`INSERT INTO ad_sets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(scope.owner_id, scope.workspace_id, scope.brand_id, assertStableId(adSet.id, "ad_set.id"),
            assertStableId(adSet.campaign_id, "ad_set.campaign_id"), assertStableId(adSet.audience_id, "ad_set.audience_id"),
            assertText(adSet.name, "ad_set.name", 240), assertText(adSet.status, "ad_set.status", 80), now);
      }
      for (const ad of fixture.ads) {
        this.#database.prepare(`INSERT INTO ads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(scope.owner_id, scope.workspace_id, scope.brand_id, assertStableId(ad.id, "ad.id"),
            assertStableId(ad.ad_set_id, "ad.ad_set_id"), assertText(ad.name, "ad.name", 240),
            assertText(ad.headline, "ad.headline", 500), assertText(ad.primary_text, "ad.primary_text", 4_000),
            assertText(ad.status, "ad.status", 80), now);
      }
      fixture.creative_assets.forEach((asset, index) => {
        const media = storedMedia[index];
        if (!media) throw new Error("Fixture media result is missing.");
        this.#database.prepare(`
          INSERT OR IGNORE INTO media_objects(owner_id, workspace_id, sha256, byte_size, mime_type, relative_key, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(scope.owner_id, scope.workspace_id, media.sha256, media.byte_size, media.mime_type, media.relative_key, now);
        this.#database.prepare(`INSERT INTO creative_assets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(scope.owner_id, scope.workspace_id, scope.brand_id, assertStableId(asset.id, "creative_asset.id"),
            assertStableId(asset.ad_id, "creative_asset.ad_id"), assertText(asset.name, "creative_asset.name", 240),
            assertText(asset.asset_type, "creative_asset.asset_type", 80), media.sha256, now);
      });
      for (const hypothesis of fixture.hypotheses) {
        this.#database.prepare(`INSERT INTO hypotheses VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(scope.owner_id, scope.workspace_id, scope.brand_id, assertStableId(hypothesis.id, "hypothesis.id"),
            assertText(hypothesis.statement, "hypothesis.statement"), assertText(hypothesis.status, "hypothesis.status", 80), now);
      }
      for (const experiment of fixture.experiments) {
        this.#database.prepare(`INSERT INTO experiments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(scope.owner_id, scope.workspace_id, scope.brand_id, assertStableId(experiment.id, "experiment.id"),
            assertStableId(experiment.hypothesis_id, "experiment.hypothesis_id"),
            assertText(experiment.name, "experiment.name", 240), experiment.status,
            assertStableId(experiment.control_ad_id, "experiment.control_ad_id"),
            assertStableId(experiment.variant_ad_id, "experiment.variant_ad_id"),
            assertTimestamp(experiment.started_at, "experiment.started_at"),
            assertTimestamp(experiment.ended_at, "experiment.ended_at"), now);
      }
      for (const outcome of fixture.outcomes) this.#insertOutcome(scope, outcome, now);
      for (const evidence of fixture.evidence) this.#insertEvidence(scope, evidence, now);

      const observation = fixture.observation;
      this.#database.prepare(`INSERT INTO observations VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(scope.owner_id, scope.workspace_id, scope.brand_id,
          assertStableId(observation.observation_id, "observation.id"),
          assertText(observation.statement, "observation.statement"),
          assertStableId(observation.evidence_id, "observation.evidence_id"), now);

      const learning = fixture.learning;
      this.#insertLearning({
        scope,
        learning_id: learning.learning_id,
        state: learning.state,
        statement: learning.statement,
        provenance: learning.provenance,
        confidence: learning.confidence,
        applicability: learning.applicability,
        limitations: learning.limitations,
        approval_state: learning.approval_state,
        supporting_evidence_ids: learning.supporting_evidence_ids,
        counterevidence_ids: [],
        supersedes_learning_id: null,
        change_reason: "fixture candidate created from a recorded observation",
        now,
      });

      this.#database.prepare(`
        INSERT INTO ingestion_receipts(owner_id, workspace_id, ingestion_key, input_sha256, status, created_at)
        VALUES (?, ?, ?, ?, 'created', ?)
      `).run(scope.owner_id, scope.workspace_id, ingestionKey, inputSha256, now);
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
    return { ingestion_key: ingestionKey, input_sha256: inputSha256, status: "created", media: storedMedia };
  }

  #insertOutcome(scope: LearningScope, outcome: WarehouseMeasurement, now: string): void {
    const checked = exactScope(outcome);
    if (canonicalJson(checked) !== canonicalJson(scope)) throw new Error("Outcome scope does not match fixture scope.");
    const values = [outcome.spend, outcome.impressions, outcome.clicks, outcome.conversions, outcome.leads, outcome.qualified_leads];
    if (values.some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
      throw new Error("Outcome metrics must be finite non-negative numbers.");
    }
    const inputHash = createHash("sha256").update(canonicalJson(outcome)).digest("hex");
    this.#database.prepare(`
      INSERT INTO normalized_outcomes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(scope.owner_id, scope.workspace_id, scope.brand_id,
      assertStableId(outcome.outcome_id, "outcome.id"), assertStableId(outcome.experiment_id, "outcome.experiment_id"),
      outcome.ad_id === null ? null : assertStableId(outcome.ad_id, "outcome.ad_id"),
      assertTimestamp(outcome.period_start, "outcome.period_start"), assertTimestamp(outcome.period_end, "outcome.period_end"),
      assertText(outcome.currency, "outcome.currency", 3).toUpperCase(), outcome.spend, outcome.impressions,
      outcome.clicks, outcome.conversions, outcome.leads, outcome.qualified_leads,
      outcome.lead_quality_score, assertText(outcome.attribution_model, "outcome.attribution_model", 120),
      assertTimestamp(outcome.freshness_as_of, "outcome.freshness_as_of"),
      assertText(outcome.source_type, "outcome.source_type", 120), outcome.fixture_only ? 1 : 0, inputHash, now);
  }

  #insertEvidence(scope: LearningScope, evidence: LearningCoreFixture["evidence"][number], now: string): void {
    if (evidence.sha256 && !/^[a-f0-9]{64}$/.test(evidence.sha256)) throw new Error("Evidence SHA-256 is invalid.");
    this.#database.prepare(`
      INSERT INTO evidence VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(scope.owner_id, scope.workspace_id, scope.brand_id,
      assertStableId(evidence.evidence_id, "evidence.id"), evidence.kind,
      assertText(evidence.source_type, "evidence.source_type", 120),
      assertText(evidence.source_ref, "evidence.source_ref", 500), evidence.sha256,
      assertTimestamp(evidence.observed_at, "evidence.observed_at"),
      assertTimestamp(evidence.freshness_as_of, "evidence.freshness_as_of"),
      evidence.fixture_only ? 1 : 0, canonicalJson(evidence.metadata), now);
  }

  #insertLearning(input: {
    scope: LearningScope;
    learning_id: string;
    state: LearningState;
    statement: string;
    provenance: string;
    confidence: number;
    applicability: string;
    limitations: string[];
    approval_state: ApprovalState;
    supporting_evidence_ids: string[];
    counterevidence_ids: string[];
    supersedes_learning_id: string | null;
    change_reason: string;
    now: string;
  }): void {
    const { scope } = input;
    const learningId = assertStableId(input.learning_id, "learning_id");
    const statement = assertText(input.statement, "learning.statement");
    const provenance = assertText(input.provenance, "learning.provenance", 2_000);
    const applicability = assertText(input.applicability, "learning.applicability", 2_000);
    const limitations = input.limitations.map((item) => assertText(item, "learning.limitation", 1_000));
    const confidence = assertConfidence(input.confidence);
    this.#database.prepare(`
      INSERT INTO learnings VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(scope.owner_id, scope.workspace_id, scope.brand_id, learningId, input.state, statement, provenance,
      confidence, applicability, JSON.stringify(limitations), input.approval_state, input.supersedes_learning_id,
      input.now, input.now);
    this.#database.prepare(`
      INSERT INTO learning_versions VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(scope.owner_id, scope.workspace_id, scope.brand_id, learningId, input.state, statement, provenance,
      confidence, applicability, JSON.stringify(limitations), input.approval_state, input.supersedes_learning_id,
      assertText(input.change_reason, "change_reason", 1_000), input.now);
    for (const evidenceId of input.supporting_evidence_ids) {
      this.#database.prepare(`INSERT INTO learning_evidence VALUES (?, ?, ?, 1, ?, 'support')`)
        .run(scope.owner_id, scope.workspace_id, learningId, assertStableId(evidenceId, "supporting_evidence_id"));
    }
    for (const evidenceId of input.counterevidence_ids) {
      this.#database.prepare(`INSERT INTO learning_evidence VALUES (?, ?, ?, 1, ?, 'counter')`)
        .run(scope.owner_id, scope.workspace_id, learningId, assertStableId(evidenceId, "counterevidence_id"));
    }
    this.#database.prepare(`
      INSERT INTO learning_fts(owner_id, workspace_id, brand_id, learning_id, version, statement, applicability, limitations)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    `).run(scope.owner_id, scope.workspace_id, scope.brand_id, learningId, statement, applicability, limitations.join(" "));
  }

  getBrand(scope: LearningScope): { id: string; name: string; description: string } | null {
    const [owner, workspace, brand] = scopeParams(scope);
    const row = this.#database.prepare(`
      SELECT id, name, description FROM brands WHERE owner_id = ? AND workspace_id = ? AND id = ?
    `).get(owner, workspace, brand) as SqlRow | undefined;
    return row ? { id: stringValue(row, "id"), name: stringValue(row, "name"), description: stringValue(row, "description") } : null;
  }

  listAds(scope: LearningScope, query: string | null = null): Array<{
    id: string; name: string; headline: string; primary_text: string; status: string;
  }> {
    const [owner, workspace, brand] = scopeParams(scope);
    const boundedQuery = query === null ? null : `%${assertText(query, "query", 200).toLowerCase()}%`;
    const rows = boundedQuery === null
      ? this.#database.prepare(`
          SELECT id, name, headline, primary_text, status FROM ads
          WHERE owner_id = ? AND workspace_id = ? AND brand_id = ? ORDER BY id LIMIT 100
        `).all(owner, workspace, brand)
      : this.#database.prepare(`
          SELECT id, name, headline, primary_text, status FROM ads
          WHERE owner_id = ? AND workspace_id = ? AND brand_id = ?
            AND (lower(name) LIKE ? OR lower(headline) LIKE ? OR lower(primary_text) LIKE ?)
          ORDER BY id LIMIT 100
        `).all(owner, workspace, brand, boundedQuery, boundedQuery, boundedQuery);
    return rows.map((row) => ({
      id: stringValue(row, "id"), name: stringValue(row, "name"), headline: stringValue(row, "headline"),
      primary_text: stringValue(row, "primary_text"), status: stringValue(row, "status"),
    }));
  }

  listOutcomes(scope: LearningScope): WarehouseMeasurement[] {
    const [owner, workspace, brand] = scopeParams(scope);
    const rows = this.#database.prepare(`
      SELECT * FROM normalized_outcomes
      WHERE owner_id = ? AND workspace_id = ? AND brand_id = ?
      ORDER BY freshness_as_of DESC, id
    `).all(owner, workspace, brand);
    return rows.map((row) => ({
      owner_id: owner,
      workspace_id: workspace,
      brand_id: brand,
      outcome_id: stringValue(row, "id"),
      experiment_id: stringValue(row, "experiment_id"),
      ad_id: nullableString(row, "ad_id"),
      period_start: stringValue(row, "period_start"),
      period_end: stringValue(row, "period_end"),
      currency: stringValue(row, "currency"),
      spend: numberValue(row, "spend"),
      impressions: numberValue(row, "impressions"),
      clicks: numberValue(row, "clicks"),
      conversions: numberValue(row, "conversions"),
      leads: numberValue(row, "leads"),
      qualified_leads: numberValue(row, "qualified_leads"),
      lead_quality_score: row.lead_quality_score === null ? null : numberValue(row, "lead_quality_score"),
      attribution_model: stringValue(row, "attribution_model"),
      freshness_as_of: stringValue(row, "freshness_as_of"),
      source_type: stringValue(row, "source_type"),
      fixture_only: numberValue(row, "fixture_only") === 1,
    }));
  }

  getLearning(scope: LearningScope, learningId: string): LearningRecord | null {
    const [owner, workspace, brand] = scopeParams(scope);
    const id = assertStableId(learningId, "learning_id");
    const row = this.#database.prepare(`
      SELECT * FROM learnings WHERE owner_id = ? AND workspace_id = ? AND brand_id = ? AND id = ?
    `).get(owner, workspace, brand, id) as SqlRow | undefined;
    if (!row) return null;
    return {
      owner_id: owner,
      workspace_id: workspace,
      brand_id: brand,
      learning_id: id,
      version: numberValue(row, "current_version"),
      state: stringValue(row, "state") as LearningState,
      statement: stringValue(row, "statement"),
      provenance: stringValue(row, "provenance"),
      confidence: numberValue(row, "confidence"),
      applicability: stringValue(row, "applicability"),
      limitations: jsonArray(row, "limitations_json"),
      approval_state: stringValue(row, "approval_state") as ApprovalState,
      supporting_evidence: this.listLearningEvidence(scope, id, numberValue(row, "current_version"), "support"),
      counterevidence: this.listLearningEvidence(scope, id, numberValue(row, "current_version"), "counter"),
      created_at: stringValue(row, "created_at"),
      updated_at: stringValue(row, "updated_at"),
      supersedes_learning_id: nullableString(row, "supersedes_learning_id"),
    };
  }

  getLearningVersion(scope: LearningScope, learningId: string, version: number): LearningRecord | null {
    const [owner, workspace, brand] = scopeParams(scope);
    if (!Number.isInteger(version) || version < 1) throw new Error("version must be a positive integer.");
    const id = assertStableId(learningId, "learning_id");
    const row = this.#database.prepare(`
      SELECT * FROM learning_versions
      WHERE owner_id = ? AND workspace_id = ? AND brand_id = ? AND learning_id = ? AND version = ?
    `).get(owner, workspace, brand, id, version) as SqlRow | undefined;
    if (!row) return null;
    const original = this.#database.prepare(`
      SELECT created_at FROM learnings WHERE owner_id = ? AND workspace_id = ? AND brand_id = ? AND id = ?
    `).get(owner, workspace, brand, id) as SqlRow | undefined;
    return {
      owner_id: owner,
      workspace_id: workspace,
      brand_id: brand,
      learning_id: id,
      version,
      state: stringValue(row, "state") as LearningState,
      statement: stringValue(row, "statement"),
      provenance: stringValue(row, "provenance"),
      confidence: numberValue(row, "confidence"),
      applicability: stringValue(row, "applicability"),
      limitations: jsonArray(row, "limitations_json"),
      approval_state: stringValue(row, "approval_state") as ApprovalState,
      supporting_evidence: this.listLearningEvidence(scope, id, version, "support"),
      counterevidence: this.listLearningEvidence(scope, id, version, "counter"),
      created_at: original ? stringValue(original, "created_at") : stringValue(row, "created_at"),
      updated_at: stringValue(row, "created_at"),
      supersedes_learning_id: nullableString(row, "supersedes_learning_id"),
    };
  }

  transitionLearning(input: {
    scope: LearningScope;
    learning_id: string;
    to_state: LearningState;
    approval_state: ApprovalState;
    change_reason: string;
    statement?: string;
    confidence?: number;
    applicability?: string;
    limitations?: string[];
    supporting_evidence_ids?: string[];
    counterevidence_ids?: string[];
    replacement_learning_id?: string;
  }): LearningRecord {
    const scope = exactScope(input.scope);
    const current = this.getLearning(scope, input.learning_id);
    if (!current) throw new Error("Learning does not exist in the requested scope.");
    const allowed: Record<LearningState, LearningState[]> = {
      observation: ["candidate", "contradicted"],
      candidate: ["supported", "contradicted"],
      supported: ["trusted", "contradicted", "superseded"],
      trusted: ["contradicted", "superseded"],
      contradicted: [],
      superseded: [],
    };
    if (!allowed[current.state].includes(input.to_state)) {
      if (current.state === "candidate" && input.to_state === "trusted") {
        throw new Error("A candidate learning must move to supported before trusted.");
      }
      throw new Error(`Learning transition ${current.state} to ${input.to_state} is not allowed.`);
    }
    const supportIds = boundedIds([
      ...current.supporting_evidence.map((item) => item.evidence_id),
      ...(input.supporting_evidence_ids ?? []),
    ], "supporting_evidence_id");
    const counterIds = boundedIds([
      ...current.counterevidence.map((item) => item.evidence_id),
      ...(input.counterevidence_ids ?? []),
    ], "counterevidence_id");
    if ((input.to_state === "supported" || input.to_state === "trusted") && input.approval_state !== "approved") {
      throw new Error(`${input.to_state} promotion requires explicit approval.`);
    }
    if (input.to_state === "supported" && supportIds.length < 1) {
      throw new Error("Supported promotion requires supporting evidence.");
    }
    if (input.to_state === "trusted" && supportIds.length < 2) {
      throw new Error("Trusted promotion requires at least two supporting evidence receipts.");
    }
    if (input.to_state === "contradicted" && counterIds.length === 0) {
      throw new Error("Contradiction requires scoped counterevidence.");
    }
    if (input.to_state === "superseded" && !input.replacement_learning_id) {
      throw new Error("Supersession requires a replacement learning ID.");
    }
    for (const evidenceId of [...supportIds, ...counterIds]) {
      if (!this.#evidenceExists(scope, evidenceId)) throw new Error(`Evidence ${evidenceId} is missing from the requested brand scope.`);
    }
    const nextVersion = current.version + 1;
    const statement = input.statement === undefined ? current.statement : assertText(input.statement, "learning.statement");
    const confidence = input.confidence === undefined ? current.confidence : assertConfidence(input.confidence);
    const applicability = input.applicability === undefined
      ? current.applicability
      : assertText(input.applicability, "learning.applicability", 2_000);
    const limitations = (input.limitations ?? current.limitations)
      .map((item) => assertText(item, "learning.limitation", 1_000));
    const replacementId = input.replacement_learning_id
      ? assertStableId(input.replacement_learning_id, "replacement_learning_id")
      : current.supersedes_learning_id;
    const now = this.now();
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      this.#database.prepare(`
        UPDATE learnings SET current_version = ?, state = ?, statement = ?, confidence = ?,
          applicability = ?, limitations_json = ?, approval_state = ?, supersedes_learning_id = ?, updated_at = ?
        WHERE owner_id = ? AND workspace_id = ? AND brand_id = ? AND id = ?
      `).run(nextVersion, input.to_state, statement, confidence, applicability, JSON.stringify(limitations),
        input.approval_state, replacementId, now,
        scope.owner_id, scope.workspace_id, scope.brand_id, current.learning_id);
      this.#database.prepare(`
        INSERT INTO learning_versions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(scope.owner_id, scope.workspace_id, scope.brand_id, current.learning_id, nextVersion,
        input.to_state, statement, current.provenance, confidence, applicability, JSON.stringify(limitations),
        input.approval_state, replacementId, assertText(input.change_reason, "change_reason", 1_000), now);
      for (const evidenceId of supportIds) {
        this.#database.prepare(`INSERT INTO learning_evidence VALUES (?, ?, ?, ?, ?, 'support')`)
          .run(scope.owner_id, scope.workspace_id, current.learning_id, nextVersion, evidenceId);
      }
      for (const evidenceId of counterIds) {
        this.#database.prepare(`INSERT INTO learning_evidence VALUES (?, ?, ?, ?, ?, 'counter')`)
          .run(scope.owner_id, scope.workspace_id, current.learning_id, nextVersion, evidenceId);
      }
      this.#database.prepare(`
        DELETE FROM learning_fts WHERE owner_id = ? AND workspace_id = ? AND brand_id = ? AND learning_id = ?
      `).run(scope.owner_id, scope.workspace_id, scope.brand_id, current.learning_id);
      this.#database.prepare(`
        INSERT INTO learning_fts(owner_id, workspace_id, brand_id, learning_id, version, statement, applicability, limitations)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(scope.owner_id, scope.workspace_id, scope.brand_id, current.learning_id, nextVersion,
        statement, applicability, limitations.join(" | "));
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
    const result = this.getLearning(scope, current.learning_id);
    if (!result) throw new Error("Learning transition did not persist.");
    return result;
  }

  #evidenceExists(scope: LearningScope, evidenceId: string): boolean {
    const [owner, workspace, brand] = scopeParams(scope);
    return Boolean(this.#database.prepare(`
      SELECT 1 FROM evidence WHERE owner_id = ? AND workspace_id = ? AND brand_id = ? AND id = ?
    `).get(owner, workspace, brand, assertStableId(evidenceId, "evidence_id")));
  }

  listLearningEvidence(scope: LearningScope, learningId: string, version: number, role: "support" | "counter"): EvidenceReceipt[] {
    const [owner, workspace, brand] = scopeParams(scope);
    const rows = this.#database.prepare(`
      SELECT e.* FROM evidence e
      JOIN learning_evidence le
        ON le.owner_id = e.owner_id AND le.workspace_id = e.workspace_id AND le.evidence_id = e.id
      WHERE le.owner_id = ? AND le.workspace_id = ? AND e.brand_id = ?
        AND le.learning_id = ? AND le.learning_version = ? AND le.role = ?
      ORDER BY e.id
    `).all(owner, workspace, brand, assertStableId(learningId, "learning_id"), version, role);
    return rows.map(evidenceFromRow);
  }

  listEvidence(scope: LearningScope): EvidenceReceipt[] {
    const [owner, workspace, brand] = scopeParams(scope);
    return this.#database.prepare(`
      SELECT * FROM evidence WHERE owner_id = ? AND workspace_id = ? AND brand_id = ? ORDER BY id
    `).all(owner, workspace, brand).map(evidenceFromRow);
  }

  recordEvidence(
    scope: LearningScope,
    evidence: EvidenceReceipt,
    metadata: Record<string, unknown>,
  ): EvidenceReceipt {
    const checked = exactScope(scope);
    assertNoSecretMaterial({ evidence, metadata }, "Learning Core evidence");
    if (!this.getBrand(checked)) throw new Error("Evidence brand does not exist in the requested scope.");
    this.#insertEvidence(checked, { ...evidence, metadata }, this.now());
    const inserted = this.listEvidence(checked).find((item) => item.evidence_id === evidence.evidence_id);
    if (!inserted) throw new Error("Evidence did not persist.");
    return inserted;
  }

  searchLearnings(scope: LearningScope, query: string, tokenBudget: number): RetrievalReceipt {
    const [owner, workspace, brand] = scopeParams(scope);
    const normalizedQuery = assertText(query, "query", 500);
    assertNoSecretMaterial(normalizedQuery, "Learning Core retrieval query");
    const terms = normalizedQuery.toLowerCase().match(/[a-z0-9]{2,}/g)?.slice(0, 20) ?? [];
    const rows = terms.length === 0 ? [] : this.#database.prepare(`
      SELECT f.learning_id, f.version, f.statement, f.applicability, f.limitations,
             l.state, l.confidence, bm25(learning_fts) AS rank
      FROM learning_fts f
      JOIN learnings l ON l.owner_id = f.owner_id AND l.workspace_id = f.workspace_id
        AND l.brand_id = f.brand_id AND l.id = f.learning_id AND l.current_version = CAST(f.version AS INTEGER)
      WHERE learning_fts MATCH ? AND f.owner_id = ? AND f.workspace_id = ? AND f.brand_id = ?
      ORDER BY rank LIMIT 50
    `).all(terms.join(" OR "), owner, workspace, brand);
    const matches: RetrievalMatch[] = [];
    let estimatedTokens = 0;
    let truncated = false;
    for (const row of rows) {
      const text = `${stringValue(row, "statement")} ${stringValue(row, "applicability")} ${stringValue(row, "limitations")}`;
      const tokensForMatch = Math.max(1, Math.ceil(text.length / 4));
      if (estimatedTokens + tokensForMatch > tokenBudget) {
        truncated = true;
        continue;
      }
      estimatedTokens += tokensForMatch;
      matches.push({
        learning_id: stringValue(row, "learning_id"),
        version: numberValue(row, "version"),
        state: stringValue(row, "state") as LearningState,
        statement: stringValue(row, "statement"),
        confidence: numberValue(row, "confidence"),
        applicability: stringValue(row, "applicability"),
        limitations: stringValue(row, "limitations").split(" | ").filter(Boolean),
        score: 1 / (1 + Math.abs(numberValue(row, "rank"))),
      });
    }
    const freshnessRow = this.#database.prepare(`
      SELECT MAX(freshness_as_of) AS freshness_as_of FROM evidence
      WHERE owner_id = ? AND workspace_id = ? AND brand_id = ?
    `).get(owner, workspace, brand) as SqlRow | undefined;
    const freshness = freshnessRow ? nullableString(freshnessRow, "freshness_as_of") : null;
    const now = this.now();
    const receiptId = `retrieval_${randomUUID().replaceAll("-", "")}`;
    this.#database.prepare(`
      INSERT INTO retrieval_receipts VALUES (?, ?, ?, ?, ?, 'fts5', ?, ?, ?, ?, ?, ?)
    `).run(owner, workspace, brand, receiptId,
      createHash("sha256").update(normalizedQuery).digest("hex"), tokenBudget, estimatedTokens,
      truncated ? 1 : 0, JSON.stringify(matches.map((match) => match.learning_id)), freshness, now);
    return {
      owner_id: owner,
      workspace_id: workspace,
      brand_id: brand,
      receipt_id: receiptId,
      query: normalizedQuery,
      strategy: "fts5",
      token_budget: tokenBudget,
      estimated_tokens: estimatedTokens,
      truncated,
      matches,
      freshness_as_of: freshness,
      created_at: now,
    };
  }

  listLearningDocuments(scope: LearningScope): VectorDocument[] {
    const [owner, workspace, brand] = scopeParams(scope);
    return this.#database.prepare(`
      SELECT id, current_version, statement, applicability, limitations_json FROM learnings
      WHERE owner_id = ? AND workspace_id = ? AND brand_id = ? ORDER BY id
    `).all(owner, workspace, brand).map((row) => ({
      owner_id: owner,
      workspace_id: workspace,
      brand_id: brand,
      learning_id: stringValue(row, "id"),
      version: numberValue(row, "current_version"),
      text: `${stringValue(row, "statement")} ${stringValue(row, "applicability")} ${jsonArray(row, "limitations_json").join(" ")}`,
    }));
  }

  putVector(input: VectorDocument & {
    model: string; vector: number[]; content_sha256: string; rebuilt_at: string;
  }): void {
    const scope = exactScope(input);
    this.#database.prepare(`
      INSERT INTO vector_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner_id, workspace_id, learning_id, version) DO UPDATE SET
        brand_id = excluded.brand_id, model = excluded.model, dimensions = excluded.dimensions,
        vector_json = excluded.vector_json, content_sha256 = excluded.content_sha256, rebuilt_at = excluded.rebuilt_at
    `).run(scope.owner_id, scope.workspace_id, scope.brand_id,
      assertStableId(input.learning_id, "learning_id"), input.version,
      assertText(input.model, "vector.model", 120), input.vector.length, JSON.stringify(input.vector),
      input.content_sha256, assertTimestamp(input.rebuilt_at, "rebuilt_at"));
  }

  listVectors(scope: LearningScope): Array<{ learning_id: string; version: number; vector: number[] }> {
    const [owner, workspace, brand] = scopeParams(scope);
    return this.#database.prepare(`
      SELECT learning_id, version, vector_json FROM vector_entries
      WHERE owner_id = ? AND workspace_id = ? AND brand_id = ? ORDER BY learning_id
    `).all(owner, workspace, brand).map((row) => ({
      learning_id: stringValue(row, "learning_id"),
      version: numberValue(row, "version"),
      vector: JSON.parse(stringValue(row, "vector_json")) as number[],
    }));
  }

  clearVectors(scope: LearningScope): number {
    const [owner, workspace, brand] = scopeParams(scope);
    return changeCount(this.#database.prepare(`
      DELETE FROM vector_entries WHERE owner_id = ? AND workspace_id = ? AND brand_id = ?
    `).run(owner, workspace, brand).changes);
  }

  recordVaultProjection(input: LearningScope & {
    learning_id: string; version: number; relative_path: string; sha256: string; generated_at: string;
  }): void {
    const scope = exactScope(input);
    this.#database.prepare(`
      INSERT OR REPLACE INTO vault_projections VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(scope.owner_id, scope.workspace_id, scope.brand_id,
      assertStableId(input.learning_id, "learning_id"), input.version,
      assertText(input.relative_path, "relative_path", 500), input.sha256,
      assertTimestamp(input.generated_at, "generated_at"));
  }

  getVaultProjection(scope: LearningScope, learningId: string): {
    version: number; relative_path: string; sha256: string; generated_at: string;
  } | null {
    const [owner, workspace, brand] = scopeParams(scope);
    const row = this.#database.prepare(`
      SELECT learning_version, relative_path, sha256, generated_at FROM vault_projections
      WHERE owner_id = ? AND workspace_id = ? AND brand_id = ? AND learning_id = ?
      ORDER BY learning_version DESC LIMIT 1
    `).get(owner, workspace, brand, assertStableId(learningId, "learning_id")) as SqlRow | undefined;
    return row ? {
      version: numberValue(row, "learning_version"),
      relative_path: stringValue(row, "relative_path"),
      sha256: stringValue(row, "sha256"),
      generated_at: stringValue(row, "generated_at"),
    } : null;
  }

  recordHumanRevision(input: LearningScope & {
    import_id: string;
    learning_id: string;
    base_version: number;
    proposed_statement: string;
    note_sha256: string;
  }): { import_id: string; status: "pending_review" } {
    const scope = exactScope(input);
    assertNoSecretMaterial(input.proposed_statement, "Human Learning Core revision");
    const learning = this.getLearning(scope, input.learning_id);
    if (!learning) throw new Error("Learning does not exist in the requested scope.");
    if (learning.version !== input.base_version) throw new Error("Human revision is based on a stale learning version.");
    this.#database.prepare(`
      INSERT OR IGNORE INTO human_revision_imports VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?)
    `).run(scope.owner_id, scope.workspace_id, scope.brand_id,
      assertStableId(input.import_id, "import_id"), learning.learning_id, input.base_version,
      assertText(input.proposed_statement, "proposed_statement"), input.note_sha256, this.now());
    return { import_id: input.import_id, status: "pending_review" };
  }

  createProposal(scope: LearningScope, input: {
    kind: "experiment" | "loop_policy_change";
    summary: string;
    diff: Array<{ field: string; before: string | null; after: string }>;
  }): { id: string; hash: string; status: "proposed" | "approved" | "rejected" } {
    const checked = exactScope(scope);
    const normalized = {
      kind: input.kind,
      summary: assertText(input.summary, "proposal.summary", 2_000),
      diff: input.diff.map((item) => ({
        field: assertText(item.field, "proposal.diff.field", 120),
        before: item.before === null ? null : assertText(item.before, "proposal.diff.before", 1_000),
        after: assertText(item.after, "proposal.diff.after", 1_000),
      })),
    };
    assertNoSecretMaterial(normalized, "Learning Core proposal");
    const hash = createHash("sha256").update(canonicalJson({ scope: checked, ...normalized })).digest("hex");
    const id = `proposal_${hash.slice(0, 20)}`;
    this.#database.prepare(`
      INSERT OR IGNORE INTO proposals VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?)
    `).run(checked.owner_id, checked.workspace_id, checked.brand_id, id, normalized.kind,
      normalized.summary, canonicalJson(normalized.diff), hash, this.now());
    const row = this.#database.prepare(`
      SELECT status FROM proposals WHERE owner_id = ? AND workspace_id = ? AND brand_id = ? AND id = ?
    `).get(checked.owner_id, checked.workspace_id, checked.brand_id, id) as SqlRow | undefined;
    if (!row) throw new Error("Proposal did not persist.");
    return { id, hash, status: stringValue(row, "status") as "proposed" | "approved" | "rejected" };
  }

  recordDecision(scope: LearningScope, input: {
    proposal_id: string;
    proposal_hash: string;
    decision: "approved" | "rejected";
    approved_by: string;
    rationale: string;
    decided_at: string;
  }): {
    decision_id: string;
    proposal_id: string;
    decision: "approved" | "rejected";
    decided_at: string;
  } {
    const checked = exactScope(scope);
    assertNoSecretMaterial(input, "Learning Core decision");
    const proposalId = assertStableId(input.proposal_id, "proposal_id");
    if (!/^[a-f0-9]{64}$/.test(input.proposal_hash)) throw new Error("proposal_hash must be a SHA-256 value.");
    const proposal = this.#database.prepare(`
      SELECT proposal_hash, status FROM proposals
      WHERE owner_id = ? AND workspace_id = ? AND brand_id = ? AND id = ?
    `).get(checked.owner_id, checked.workspace_id, checked.brand_id, proposalId) as SqlRow | undefined;
    if (!proposal) throw new Error("Proposal was not found in the requested scope.");
    if (stringValue(proposal, "proposal_hash") !== input.proposal_hash) {
      throw new Error("Proposal hash does not match the reviewable diff.");
    }
    if (input.decision !== "approved" && input.decision !== "rejected") throw new Error("decision is invalid.");
    const approvedBy = assertStableId(input.approved_by, "approved_by");
    const rationale = assertText(input.rationale, "rationale", 2_000);
    const decidedAt = assertTimestamp(input.decided_at, "decided_at");
    const decisionId = `decision_${createHash("sha256").update(canonicalJson({
      scope: checked,
      proposal_id: proposalId,
      proposal_hash: input.proposal_hash,
      decision: input.decision,
      approved_by: approvedBy,
      rationale,
      decided_at: decidedAt,
    })).digest("hex").slice(0, 20)}`;
    const existing = this.#database.prepare(`
      SELECT id, decision, decided_at FROM decisions
      WHERE owner_id = ? AND workspace_id = ? AND brand_id = ? AND proposal_id = ?
    `).get(checked.owner_id, checked.workspace_id, checked.brand_id, proposalId) as SqlRow | undefined;
    if (existing) {
      if (stringValue(existing, "id") !== decisionId) {
        throw new Error("Proposal already has a different immutable decision record.");
      }
      return {
        decision_id: decisionId,
        proposal_id: proposalId,
        decision: stringValue(existing, "decision") as "approved" | "rejected",
        decided_at: stringValue(existing, "decided_at"),
      };
    }
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      this.#database.prepare(`
        INSERT INTO decisions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(checked.owner_id, checked.workspace_id, checked.brand_id, decisionId, proposalId,
        input.proposal_hash, input.decision, approvedBy, rationale, decidedAt, this.now());
      this.#database.prepare(`
        UPDATE proposals SET status = ? WHERE owner_id = ? AND workspace_id = ? AND brand_id = ? AND id = ?
      `).run(input.decision, checked.owner_id, checked.workspace_id, checked.brand_id, proposalId);
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
    return { decision_id: decisionId, proposal_id: proposalId, decision: input.decision, decided_at: decidedAt };
  }
}
