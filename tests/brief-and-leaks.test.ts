import assert from "node:assert/strict";
import test from "node:test";
import { generateProjectBrief } from "@/lib/contracts/brief";
import {
  EXAMPLE_ONLY_TERMS,
  scanForExampleLeaks,
} from "@/lib/contracts/example-leak-scan.mjs";
import {
  createSyntheticProject,
  executeDeterministicFixture,
} from "@/lib/runtime/fixture";
import { readyInternalIntake } from "./helpers";

test("project brief is deterministic, two-sided, dated, and explicit about boundaries", () => {
  const intake = readyInternalIntake();
  intake.market.known_seasonality = "research_this";
  intake.lead_product.return_or_replacement_policy = "not_applicable";
  const first = generateProjectBrief(
    intake,
    { "market.known_seasonality": "research_this" },
    "2026-01-15",
  );
  const second = generateProjectBrief(
    structuredClone(intake),
    { "market.known_seasonality": "research_this" },
    "2026-01-15",
  );
  assert.equal(first, second);
  assert.match(first, /^# 00 — Project brief/m);
  assert.match(first, /Brief date:\*\* 2026-01-15/);
  assert.match(first, /Lead consumer \/ end-customer audience/);
  assert.match(first, /### Lead buyer/);
  assert.match(first, /research this/);
  assert.match(first, /not_applicable/);
  assert.match(first, /## Assumptions and conflicts/);
  assert.match(first, /## Approval boundary/);
  assert.match(first, /does not independently authorize action/);
  assert.match(first, /contains no market research findings/);
});

test("project brief generation rejects secret-bearing material", () => {
  const intake = readyInternalIntake();
  intake.project.notes = ["ghp", "abcdefghijklmnopqrstuvwxyz123456"].join("_");
  assert.throws(() => generateProjectBrief(intake), /credential-like/);
});

test("shipped synthetic data contains none of the structural-example markets", () => {
  const project = createSyntheticProject();
  const manifest = executeDeterministicFixture(project);
  const scan = scanForExampleLeaks({ project, manifest });
  assert.deepEqual(scan, { passed: true, matches: [] });
});

test("leak scanner catches course, business-loan, and accident-example controls", () => {
  for (const value of [
    "Use the Desire‑To‑Lead sequence.",
    "A Lendio business loan persona.",
    "Case Connect MVA research.",
  ]) {
    const result = scanForExampleLeaks(value);
    assert.equal(result.passed, false, value);
    assert.ok(result.matches.length > 0, value);
  }
  assert.ok(EXAMPLE_ONLY_TERMS.length >= 30);
});
