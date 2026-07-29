import assert from "node:assert/strict";
import test from "node:test";
import {
  approvedSeedIsCurrent,
  nextResearchSeedStatus,
  proposalMatchesCurrent,
  researchSeedLengthError,
  researchSeedSha256,
} from "@/lib/research-seed";

test("research seeds are substantive and bounded", () => {
  assert.match(researchSeedLengthError("Too short") ?? "", /between 100 and 500,000/);
  assert.equal(researchSeedLengthError("Evidence-backed seed. ".repeat(8)), null);
  assert.match(researchSeedLengthError("x".repeat(500_001)) ?? "", /between 100 and 500,000/);
});

test("editing an approved seed creates draft changes without moving the Phase 2 pointer", () => {
  assert.equal(nextResearchSeedStatus(null), "draft");
  assert.equal(nextResearchSeedStatus("revision-approved"), "draft_changes");
  assert.equal(approvedSeedIsCurrent("revision-approved", "revision-approved"), true);
  assert.equal(approvedSeedIsCurrent("revision-approved", "revision-new"), false);
});

test("an AI proposal only applies to the exact revision it reviewed", () => {
  assert.equal(proposalMatchesCurrent("revision-2", "revision-2"), true);
  assert.equal(proposalMatchesCurrent("revision-2", "revision-3"), false);
  assert.equal(proposalMatchesCurrent(null, "revision-3"), false);
});

test("approved Phase 2 seed fingerprints are deterministic", async () => {
  const seed = "# Research seed\n\nEvidence and decisions for the next creative phase.";
  assert.equal(await researchSeedSha256(seed), await researchSeedSha256(seed));
  assert.notEqual(await researchSeedSha256(seed), await researchSeedSha256(`${seed}\nChanged.`));
  assert.match(await researchSeedSha256(seed), /^[a-f0-9]{64}$/);
});
