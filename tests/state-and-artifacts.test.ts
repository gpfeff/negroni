import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import {
  createDocumentContract,
  createLaneRecords,
  SECTION_CONTRACT,
  SUPPORTING_OUTPUT_CONTRACT,
} from "@/lib/contracts/defaults";
import {
  canTransitionProject,
  deriveProjectState,
  transitionLane,
  transitionProject,
} from "@/lib/contracts/state-machine";
import {
  createSyntheticProject,
  executeDeterministicFixture,
} from "@/lib/runtime/fixture";

test("project and lane transitions reject illegal jumps", () => {
  assert.equal(canTransitionProject("draft", "ready"), true);
  assert.equal(canTransitionProject("draft", "complete"), false);
  assert.equal(transitionProject("ready", "researching"), "researching");
  assert.throws(() => transitionProject("ready", "complete"), /Illegal/);

  const lane = createLaneRecords().find((item) => item.id === "market_awareness")!;
  const researching = transitionLane(
    transitionLane(lane, "ready"),
    "researching",
    { evidence_summary: "Started" },
  );
  assert.equal(researching.id, lane.id);
  assert.equal(researching.evidence_summary, "Started");
  assert.throws(() => transitionLane(lane, "complete"), /Illegal/);
});

test("project-state derivation does not treat an empty or incomplete lane set as complete", () => {
  assert.equal(deriveProjectState([]), "draft");
  const lanes = createLaneRecords();
  assert.equal(deriveProjectState(lanes), "ready");
  lanes[1] = { ...lanes[1], state: "blocked" };
  assert.equal(deriveProjectState(lanes), "partial");
});

test("the numbered document contract is exact and initially unverified", () => {
  const documents = createDocumentContract();
  assert.equal(documents.length, 10);
  assert.deepEqual(
    documents.map((item) => item.markdown_path),
    SECTION_CONTRACT.map(([, , path]) => path),
  );
  documents.forEach((item) => {
    assert.equal(item.markdown_state, "planned");
    assert.equal(item.google_doc_state, "not_published");
    assert.equal(item.parity_state, "unverified");
    assert.equal(item.google_doc_url, null);
  });
  assert.ok(
    SUPPORTING_OUTPUT_CONTRACT.some(
      (item) => item.path === "evidence-ledger.csv",
    ),
  );
  assert.ok(
    SUPPORTING_OUTPUT_CONTRACT.some(
      (item) => item.path === "document-manifest.json",
    ),
  );
  assert.equal(
    existsSync(new URL("../document-manifest.json", import.meta.url)),
    false,
  );
});

test("synthetic fixture is deterministic, partial, internally linked, and publication-blocked", () => {
  const project = createSyntheticProject();
  const first = executeDeterministicFixture(project);
  const second = executeDeterministicFixture(project);
  assert.deepEqual(first, second);
  assert.equal(first.synthetic, true);
  assert.equal(first.state, "partial");
  assert.equal(first.state, deriveProjectState(first.lanes));
  assert.equal(first.lanes.length, 11);
  assert.equal(new Set(first.lanes.map((lane) => lane.id)).size, 11);
  assert.deepEqual(
    first.artifacts.map((artifact) => artifact.markdown_path),
    ["00-project-brief.md", "01-market-awareness.md"],
  );
  assert.equal(first.documents.length, 10);
  assert.equal(
    first.lanes.find((lane) => lane.id === "google_docs_publication")?.state,
    "blocked",
  );
  assert.equal(first.validation.example_leak_scan_passed, true);

  const evidenceIds = new Set(first.evidence.map((item) => item.evidence_id));
  first.findings.forEach((finding) =>
    finding.evidence_ids.forEach((id) => assert.ok(evidenceIds.has(id))),
  );
  const artifactIds = new Set(first.artifacts.map((item) => item.id));
  first.lanes.forEach((lane) =>
    lane.artifact_ids.forEach((id) => assert.ok(artifactIds.has(id))),
  );
});

test("fixture execution rejects copies and edited pseudo-fixtures", () => {
  const copy = createSyntheticProject();
  copy.id = "copy";
  assert.throws(() => executeDeterministicFixture(copy), /visibly synthetic/);

  const edited = createSyntheticProject();
  edited.intake.market.industry = "Changed";
  assert.throws(() => executeDeterministicFixture(edited), /visibly synthetic/);
});
