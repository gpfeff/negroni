import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { runFixtureDraperRehearsal } from "../lib/learning-core/fixture-rehearsal.ts";

test("Draper explains a fixture brand Loop from authoritative evidence without taking external action", async () => {
  const runtimeRoot = await mkdtemp(resolve(tmpdir(), "negroni-learning-core-slice-"));
  try {
    const result = await runFixtureDraperRehearsal({
      runtimeRoot,
      now: "2026-07-30T20:00:00.000Z",
    });

    assert.equal(result.contract, "negroni-draper-rehearsal");
    assert.equal(result.fixture_only, true);
    assert.equal(result.ingestion.status, "created");
    assert.equal(result.projection.generated, true);
    assert.match(result.projection.relative_path, /^learnings\/[a-z0-9_-]+\.md$/);
    assert.match(result.projection.sha256, /^[a-f0-9]{64}$/);
    assert.equal(result.retrieval.matches[0]?.state, "candidate");

    const { response } = result;
    assert.equal(response.contract, "negroni-draper-response");
    assert.equal(response.intent, "explain_loop_state");
    assert.equal(response.scope.brand_id, "brand_desert_ember");
    assert.match(response.answer, /Desert Ember HVAC/i);
    assert.match(response.answer, /candidate/i);
    assert.match(response.answer, /qualified CPL/i);
    assert.equal(response.freshness.as_of, "2026-07-29T23:00:00.000Z");
    assert.ok(response.evidence.length >= 2);
    assert.ok(response.limitations.some((item) => /simulated fixture/i.test(item)));
    assert.equal(response.proposals[0]?.kind, "experiment");
    assert.equal(response.proposals[0]?.status, "proposed");
    assert.deepEqual(response.completed_actions, []);
    assert.deepEqual(response.external_actions, []);
    assert.equal(JSON.stringify(response).includes(runtimeRoot), false);
  } finally {
    await rm(runtimeRoot, { recursive: true, force: true });
  }
});
