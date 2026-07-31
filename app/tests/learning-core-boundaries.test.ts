import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import type { LearningCoreFixture } from "../lib/learning-core/contracts.ts";
import { DraperService, type DraperQueryInput } from "../lib/learning-core/draper.ts";
import { LearningCoreStore } from "../lib/learning-core/store.ts";
import { ObsidianVaultProjector } from "../lib/learning-core/vault.ts";
import { DisabledVectorIndex, SqliteVectorIndex } from "../lib/learning-core/vector-index.ts";

const fixturePath = resolve(import.meta.dirname, "../fixtures/learning-core/desert-ember.json");

async function fixture(): Promise<LearningCoreFixture> {
  return JSON.parse(await readFile(fixturePath, "utf8")) as LearningCoreFixture;
}

test("learning promotion is explicit, sequential, evidence-backed, and version-immutable", async () => {
  const runtimeRoot = await mkdtemp(resolve(tmpdir(), "negroni-learning-lifecycle-"));
  const store = LearningCoreStore.open({ runtimeRoot, now: () => "2026-07-30T20:00:00.000Z" });
  try {
    const input = await fixture();
    await store.ingestFixture(input);
    assert.throws(() => store.transitionLearning({
      scope: input.scope,
      learning_id: input.learning.learning_id,
      to_state: "supported",
      approval_state: "not_requested",
      change_reason: "model confidence alone",
    }), /approval/i);
    assert.throws(() => store.transitionLearning({
      scope: input.scope,
      learning_id: input.learning.learning_id,
      to_state: "trusted",
      approval_state: "approved",
      change_reason: "skip supported",
    }), /candidate.*supported/i);

    const promoted = store.transitionLearning({
      scope: input.scope,
      learning_id: input.learning.learning_id,
      to_state: "supported",
      approval_state: "approved",
      change_reason: "human approved the two fixture evidence receipts for supported status",
    });
    assert.equal(promoted.state, "supported");
    assert.equal(promoted.version, 2);
    const original = store.getLearningVersion(input.scope, input.learning.learning_id, 1);
    assert.equal(original?.state, "candidate");
    assert.equal(original?.statement, input.learning.statement);
    assert.equal(store.getLearning(input.scope, input.learning.learning_id)?.state, "supported");
  } finally {
    store.close();
    await rm(runtimeRoot, { recursive: true, force: true });
  }
});

test("contradiction requires counterevidence and remains distinct from silent demotion", async () => {
  const runtimeRoot = await mkdtemp(resolve(tmpdir(), "negroni-learning-contradiction-"));
  const store = LearningCoreStore.open({ runtimeRoot, now: () => "2026-07-31T20:00:00.000Z" });
  try {
    const input = await fixture();
    await store.ingestFixture(input);
    assert.throws(() => store.transitionLearning({
      scope: input.scope,
      learning_id: input.learning.learning_id,
      to_state: "contradicted",
      approval_state: "pending",
      change_reason: "unsupported model reversal",
    }), /counterevidence/i);

    store.recordEvidence(input.scope, {
      evidence_id: "evidence_fixture_counter",
      kind: "outcome",
      source_type: "sanitized_fixture_warehouse",
      source_ref: "fixture://desert-ember/outcomes/follow-up",
      sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      observed_at: "2026-07-31T19:00:00.000Z",
      freshness_as_of: "2026-07-31T19:00:00.000Z",
      fixture_only: true,
    }, { experiment_id: "experiment_follow_up_fixture", direction: "counter" });
    const contradicted = store.transitionLearning({
      scope: input.scope,
      learning_id: input.learning.learning_id,
      to_state: "contradicted",
      approval_state: "pending",
      counterevidence_ids: ["evidence_fixture_counter"],
      change_reason: "a recorded follow-up fixture outcome points in the opposite direction",
    });
    assert.equal(contradicted.state, "contradicted");
    assert.equal(contradicted.counterevidence[0]?.evidence_id, "evidence_fixture_counter");
    assert.equal(contradicted.supporting_evidence.length, 2);
    assert.throws(() => store.transitionLearning({
      scope: input.scope,
      learning_id: input.learning.learning_id,
      to_state: "supported",
      approval_state: "approved",
      change_reason: "terminal reversal",
    }), /not allowed/i);
  } finally {
    store.close();
    await rm(runtimeRoot, { recursive: true, force: true });
  }
});

test("ingestion and retrieval are idempotent, media-deduplicated, and owner/brand isolated", async () => {
  const runtimeRoot = await mkdtemp(resolve(tmpdir(), "negroni-learning-isolation-"));
  const store = LearningCoreStore.open({ runtimeRoot, now: () => "2026-07-30T20:00:00.000Z" });
  try {
    const input = await fixture();
    const first = await store.ingestFixture(input);
    const replay = await store.ingestFixture(input);
    assert.equal(first.status, "created");
    assert.equal(replay.status, "idempotent");
    assert.equal(replay.input_sha256, first.input_sha256);

    const duplicateOne = await store.media.put(Buffer.from("same fixture media"), "text/plain");
    const duplicateTwo = await store.media.put(Buffer.from("same fixture media"), "text/plain");
    assert.equal(duplicateOne.sha256, duplicateTwo.sha256);
    assert.equal(duplicateTwo.deduplicated, true);

    const wrongOwner = { ...input.scope, owner_id: "owner_other" };
    const wrongBrand = { ...input.scope, brand_id: "brand_other" };
    assert.equal(store.getBrand(wrongOwner), null);
    assert.deepEqual(store.listAds(wrongBrand), []);
    assert.equal(store.getLearning(wrongBrand, input.learning.learning_id), null);
    assert.deepEqual(store.searchLearnings(wrongOwner, "qualified CPL", 800).matches, []);

    const otherOwnerFixture: LearningCoreFixture = {
      ...structuredClone(input),
      fixture_id: "fixture_desert_ember_other_owner",
      scope: wrongOwner,
      outcomes: input.outcomes.map((outcome) => ({ ...outcome, owner_id: wrongOwner.owner_id })),
    };
    const isolated = await store.ingestFixture(otherOwnerFixture);
    assert.equal(isolated.status, "created");
    assert.ok(isolated.media.every((item) => item.deduplicated));
    assert.equal(store.getBrand(input.scope)?.name, "Desert Ember HVAC");
    assert.equal(store.getBrand(wrongOwner)?.name, "Desert Ember HVAC");
    assert.equal(store.searchLearnings(input.scope, "qualified CPL", 800).matches.length, 1);
    assert.equal(store.searchLearnings(wrongOwner, "qualified CPL", 800).matches.length, 1);
  } finally {
    store.close();
    await rm(runtimeRoot, { recursive: true, force: true });
  }
});

test("the vault is a guarded projection and human edits enter as pending validated revisions", async () => {
  const runtimeRoot = await mkdtemp(resolve(tmpdir(), "negroni-learning-vault-"));
  const store = LearningCoreStore.open({ runtimeRoot, now: () => "2026-07-30T20:00:00.000Z" });
  try {
    const input = await fixture();
    await store.ingestFixture(input);
    const vault = new ObsidianVaultProjector(store);
    const projected = await vault.project(input.scope, input.learning.learning_id);
    const notePath = resolve(store.vaultRoot, projected.relative_path);
    const note = await readFile(notePath, "utf8");
    assert.match(note, /^---\n/);
    assert.match(note, /generated: true/);
    assert.match(note, /authoritative: false/);
    assert.match(note, /id: "learning_fixture_transparency"/);
    assert.match(note, /\[\[evidence_fixture_outcome\]\]/);

    const revision = `---
generated: false
revision_of: "learning_fixture_transparency"
base_version: 1
owner_id: "owner_fixture"
workspace_id: "workspace_fixture"
brand_id: "brand_desert_ember"
---

## Proposed statement

Fee transparency may be associated with qualified-lead efficiency in this exact fixture scope, pending a controlled follow-up.
`;
    const imported = vault.importHumanRevision(input.scope, revision);
    assert.equal(imported.status, "pending_review");
    assert.equal(store.getLearning(input.scope, input.learning.learning_id)?.statement, input.learning.statement);
    assert.throws(() => vault.importHumanRevision({ ...input.scope, brand_id: "brand_other" }, revision), /scope/i);

    await writeFile(notePath, `${note}\nHuman direct edit.\n`, "utf8");
    await assert.rejects(() => vault.project(input.scope, input.learning.learning_id), /human edits/i);
  } finally {
    store.close();
    await rm(runtimeRoot, { recursive: true, force: true });
  }
});

test("FTS retrieval is token-bounded while vector entries are replaceable and rebuildable", async () => {
  const runtimeRoot = await mkdtemp(resolve(tmpdir(), "negroni-learning-retrieval-"));
  const store = LearningCoreStore.open({ runtimeRoot, now: () => "2026-07-30T20:00:00.000Z" });
  try {
    const input = await fixture();
    await store.ingestFixture(input);
    const bounded = store.searchLearnings(input.scope, "qualified CPL creative", 64);
    assert.ok(bounded.estimated_tokens <= bounded.token_budget);
    assert.equal(bounded.truncated, true);
    assert.deepEqual(bounded.matches, []);
    const full = store.searchLearnings(input.scope, "qualified CPL creative", 800);
    assert.equal(full.matches[0]?.learning_id, input.learning.learning_id);
    assert.equal(full.freshness_as_of, "2026-07-29T23:00:00.000Z");

    const vector = new SqliteVectorIndex(store);
    const documents = store.listLearningDocuments(input.scope);
    assert.equal(vector.rebuild(input.scope, documents, store.now()), 1);
    assert.equal(vector.search(input.scope, "transparent diagnostic fee", 5)[0]?.learning_id, input.learning.learning_id);
    assert.equal(vector.clear(input.scope), 1);
    assert.equal(store.getLearning(input.scope, input.learning.learning_id)?.state, "candidate");
    assert.equal(store.searchLearnings(input.scope, "qualified CPL", 800).matches.length, 1);
    assert.equal(vector.rebuild(input.scope, documents, store.now()), 1);
    assert.deepEqual(new DisabledVectorIndex().search(input.scope, "anything", 5), []);
  } finally {
    store.close();
    await rm(runtimeRoot, { recursive: true, force: true });
  }
});

test("Draper exposes validated intents, receipts, and redacted browser-safe responses rather than SQL", async () => {
  const runtimeRoot = await mkdtemp(resolve(tmpdir(), "negroni-learning-draper-"));
  const store = LearningCoreStore.open({ runtimeRoot, now: () => "2026-07-30T20:00:00.000Z" });
  try {
    const input = await fixture();
    await store.ingestFixture(input);
    const draper = new DraperService(store);
    assert.throws(() => draper.query({
      scope: input.scope,
      intent: "inspect_brand",
      question: "access_token=super-secret-canary-value",
    }), /credential/i);
    assert.throws(() => draper.query({
      scope: input.scope,
      intent: "inspect_brand",
      question: `Read ${runtimeRoot}/learning-core.sqlite`,
    }), /private local path/i);
    assert.throws(() => draper.query({
      scope: input.scope,
      intent: "inspect_brand",
      question: "Read /opt/negroni/private.sqlite",
    }), /private local path/i);
    assert.throws(() => draper.query({
      scope: input.scope,
      intent: "inspect_brand",
      question: "Read file:///Volumes/private/negroni.sqlite",
    }), /private local path/i);
    assert.throws(() => draper.query({
      scope: input.scope,
      intent: "inspect_brand",
      question: "Inspect the brand",
      sql: "DROP TABLE learnings",
    } as unknown as DraperQueryInput), /unsupported input: sql/i);
    assert.equal("executeSql" in store, false);
    assert.equal("rawQuery" in store, false);

    const response = draper.query({
      scope: input.scope,
      intent: "inspect_data_gaps",
      question: "What is stale, blocked, or missing?",
    });
    const serialized = JSON.stringify(response);
    assert.equal(serialized.includes(runtimeRoot), false);
    assert.equal(serialized.includes("super-secret-canary-value"), false);
    assert.equal(response.freshness.status, "fixture_only");
    assert.ok(response.evidence.length >= 1);
    assert.deepEqual(response.completed_actions, []);
    assert.deepEqual(response.external_actions, []);
  } finally {
    store.close();
    await rm(runtimeRoot, { recursive: true, force: true });
  }
});

test("Draper records an exact approved decision locally without executing the proposal", async () => {
  const runtimeRoot = await mkdtemp(resolve(tmpdir(), "negroni-learning-decision-"));
  const store = LearningCoreStore.open({ runtimeRoot, now: () => "2026-07-30T20:00:00.000Z" });
  try {
    const input = await fixture();
    await store.ingestFixture(input);
    const draper = new DraperService(store);
    const proposed = draper.query({
      scope: input.scope,
      intent: "propose_experiment",
      question: "What should we test next?",
    }).proposals[0];
    assert.ok(proposed);
    assert.equal(proposed.status, "proposed");
    assert.throws(() => draper.recordDecision({
      scope: input.scope,
      proposal_id: proposed.proposal_id,
      proposal_hash: "d".repeat(64),
      decision: "approved",
      approved_by: "approver_fixture",
      rationale: "Approve the local fixture experiment plan only.",
      decided_at: "2026-07-30T20:00:00.000Z",
    }), /hash/i);

    const decision = draper.recordDecision({
      scope: input.scope,
      proposal_id: proposed.proposal_id,
      proposal_hash: proposed.proposal_hash,
      decision: "approved",
      approved_by: "approver_fixture",
      rationale: "Approve the local fixture experiment plan only.",
      decided_at: "2026-07-30T20:00:00.000Z",
    });
    assert.equal(decision.contract, "negroni-draper-decision");
    assert.equal(decision.decision, "approved");
    assert.equal(decision.recorded_local_decision, true);
    assert.deepEqual(decision.completed_external_actions, []);
    assert.deepEqual(decision.external_actions, []);
  } finally {
    store.close();
    await rm(runtimeRoot, { recursive: true, force: true });
  }
});

test("every Draper capability is a bounded intent with evidence and no completed action", async () => {
  const runtimeRoot = await mkdtemp(resolve(tmpdir(), "negroni-learning-intents-"));
  const store = LearningCoreStore.open({ runtimeRoot, now: () => "2026-07-30T20:00:00.000Z" });
  try {
    const input = await fixture();
    await store.ingestFixture(input);
    const draper = new DraperService(store);
    const cases: Array<Pick<DraperQueryInput, "intent" | "query" | "ad_ids">> = [
      { intent: "inspect_brand" },
      { intent: "search_ads", query: "fee" },
      { intent: "compare_creatives", ad_ids: ["ad_generic_urgency", "ad_availability_fee"] },
      { intent: "analyze_performance" },
      { intent: "explain_loop_state" },
      { intent: "retrieve_learnings", query: "qualified CPL" },
      { intent: "inspect_data_gaps" },
      { intent: "propose_experiment" },
      { intent: "propose_loop_policy_change" },
      { intent: "prepare_change_diff" },
    ];
    for (const item of cases) {
      const response = draper.query({
        scope: input.scope,
        intent: item.intent,
        question: `Exercise the ${item.intent} contract.`,
        ...(item.query ? { query: item.query } : {}),
        ...(item.ad_ids ? { ad_ids: item.ad_ids } : {}),
      });
      assert.equal(response.intent, item.intent);
      assert.ok(response.answer.length > 0);
      assert.ok(response.evidence.length > 0);
      assert.ok(response.assumptions.length > 0);
      assert.deepEqual(response.completed_actions, []);
      assert.deepEqual(response.external_actions, []);
    }
  } finally {
    store.close();
    await rm(runtimeRoot, { recursive: true, force: true });
  }
});

test("SQLite backups pass integrity checks, restore without overwrite, and preserve immutable history", async () => {
  const runtimeRoot = await mkdtemp(resolve(tmpdir(), "negroni-learning-backup-"));
  const store = LearningCoreStore.open({ runtimeRoot, now: () => "2026-07-30T20:00:00.000Z" });
  let closed = false;
  try {
    const input = await fixture();
    await store.ingestFixture(input);
    assert.equal((await stat(store.databasePath)).mode & 0o777, 0o600);
    assert.deepEqual(store.integrityCheck(), { ok: true, result: "ok" });
    const backupPath = resolve(runtimeRoot, "backups/learning-core.sqlite");
    const backupReceipt = await store.backup(backupPath);
    assert.equal((await stat(backupPath)).mode & 0o777, 0o600);
    assert.match(backupReceipt.sha256, /^[a-f0-9]{64}$/);
    assert.ok(backupReceipt.byte_size > 0);
    await assert.rejects(() => store.backup(backupPath), /refusing to overwrite/i);

    const databasePath = store.databasePath;
    store.close();
    closed = true;
    const direct = new DatabaseSync(databasePath);
    try {
      assert.throws(() => direct.prepare(`
        UPDATE learning_versions SET statement = 'mutated' WHERE learning_id = ? AND version = 1
      `).run(input.learning.learning_id), /immutable/i);
    } finally {
      direct.close();
    }

    const restoredPath = resolve(runtimeRoot, "restored/learning-core.sqlite");
    const restoredReceipt = LearningCoreStore.restoreBackup(backupPath, restoredPath);
    assert.equal(restoredReceipt.sha256, backupReceipt.sha256);
    assert.equal((await stat(restoredPath)).mode & 0o777, 0o600);
    assert.throws(() => LearningCoreStore.restoreBackup(backupPath, restoredPath), /refusing to overwrite/i);
    const restored = LearningCoreStore.open({
      runtimeRoot: resolve(runtimeRoot, "restored-runtime"),
      databasePath: restoredPath,
      now: () => "2026-07-30T20:00:00.000Z",
    });
    try {
      assert.deepEqual(restored.integrityCheck(), { ok: true, result: "ok" });
      assert.equal(restored.getBrand(input.scope)?.name, "Desert Ember HVAC");
      assert.equal(restored.getLearningVersion(input.scope, input.learning.learning_id, 1)?.state, "candidate");
    } finally {
      restored.close();
    }
  } finally {
    if (!closed) store.close();
    await rm(runtimeRoot, { recursive: true, force: true });
  }
});
