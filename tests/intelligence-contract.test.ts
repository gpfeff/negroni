import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyIntake } from "@/lib/intelligence/defaults";
import { parseRunResult, slugifyProjectName, validateIntake } from "@/lib/intelligence/validation";
import type { IntelligenceIntake, RunResult } from "@/lib/intelligence/contracts";

function validResult(projectName = "Neutral Market Review"): RunResult {
  return {
    contract: "lead-generation-intelligence-result",
    contract_version: "3.0",
    run_id: "run-001",
    status: "complete",
    research_engine: "lead-generation-ads-discovery-intelligence",
    completed_at: "2026-07-28T20:00:00.000Z",
    outputs: {
      google_doc: { title: `${projectName} — Master Research`, url: "https://docs.google.com/document/d/doc-123/edit", verified: true },
      google_sheet: { title: `${projectName} — Competitor Ads`, url: "https://docs.google.com/spreadsheets/d/sheet-123/edit", verified: true },
      markdown: {
        filename: `${slugifyProjectName(projectName)}-master-research.md`,
        mime_type: "text/markdown",
        content: "# Main report\n\n## Executive summary\n\nObserved evidence remains bounded to the cited public record [SRC-1]. Supported inferences, hypotheses, unknowns, recommendations, limitations, unresolved questions, and sources remain explicitly labeled throughout this complete portable report.",
      },
    },
    sources: [{ id: "SRC-1", url: "https://example.com/public-record", title: "Public record", accessed_at: "2026-07-28" }],
    limitations: ["Public evidence was limited in one channel."],
    research_coverage: {
      client: { status: "complete", limitation: null },
      market_awareness: { status: "complete", limitation: null },
      b2b_lead_buyer: { status: "complete", limitation: null },
      b2c_customer: { status: "complete", limitation: null },
      competitors: { status: "complete", limitation: null },
      master_synthesis: { status: "complete", limitation: null },
    },
    competitor_monitoring: {
      engine: "meta-ads-intelligence",
      cadence: "nightly",
      local_time: "02:17",
      timezone: "America/Los_Angeles",
      status: "active",
      schedule_id: "schedule-neutral-review",
      watch_count: 3,
      last_run_at: null,
      next_run_at: "2026-07-29T09:17:00.000Z",
      blocker: null,
    },
    validation: {
      exactly_three_outputs: true,
      google_doc_readback: true,
      google_sheet_readback: true,
      markdown_doc_parity: true,
      competitor_rows_evidence_backed: true,
      citation_integrity: true,
      secret_scan_passed: true,
      example_leak_scan_passed: true,
      research_coverage_verified: true,
      competitor_monitor_receipt_verified: true,
    },
  };
}

test("partial intake needs only a name and one substantive market context item", () => {
  const intake = createEmptyIntake();
  assert.deepEqual(validateIntake(intake).slice(0, 2), ["Enter a project or report name.", "Add at least one substantive piece of market context."]);
  intake.project_name = "Neutral opportunity";
  intake.fields.industry_problem = { state: "answered", value: "Local repair demand" };
  assert.deepEqual(validateIntake(intake), []);
  assert.equal(intake.fields.economics.state, "unknown");
  intake.fields.economics = { state: "research_this", value: "" };
  assert.deepEqual(validateIntake(intake), []);
});

test("successful output contract is exactly one verified Doc, Sheet, and Markdown file", () => {
  const result = parseRunResult(validResult(), "Neutral Market Review");
  assert.deepEqual(Object.keys(result.outputs).sort(), ["google_doc", "google_sheet", "markdown"]);
  assert.equal(result.outputs.google_sheet.title, "Neutral Market Review — Competitor Ads");
  assert.equal(result.outputs.markdown.filename, "neutral-market-review-master-research.md");

  const extra = validResult() as RunResult & { outputs: RunResult["outputs"] & { evidence: object } };
  extra.outputs.evidence = {};
  assert.throws(() => parseRunResult(extra, "Neutral Market Review"), /exactly three/);
});

test("citation integrity rejects unresolved or absent source references", () => {
  const unresolved = validResult();
  unresolved.outputs.markdown.content += " Unsupported reference [SRC-2].";
  assert.throws(() => parseRunResult(unresolved, "Neutral Market Review"), /citations/);
  const absent = validResult();
  absent.outputs.markdown.content = absent.outputs.markdown.content.replace(" [SRC-1]", "");
  assert.throws(() => parseRunResult(absent, "Neutral Market Review"), /citations/);
});

test("secret-bearing intake is rejected before execution", () => {
  const intake = createEmptyIntake();
  intake.project_name = "Neutral opportunity";
  intake.market_context = "Research demand in a neutral public market.";
  intake.fields.additional_instructions = { state: "answered", value: "api_key=abc123456789012345" };
  assert.ok(validateIntake(intake).some((error) => error.includes("credential-like")));
});

test("tampered research authority is rejected before reaching the runner", () => {
  const intake = createEmptyIntake();
  intake.project_name = "Neutral opportunity";
  intake.market_context = "Research demand in a neutral public market.";

  (intake.research_engine as string) = "unapproved-research-engine";
  assert.ok(validateIntake(intake).some((error) => error.includes("canonical research engine")));

  intake.research_engine = "lead-generation-ads-discovery-intelligence";
  (intake.allowed_actions as string[]).push("submit_forms");
  assert.ok(validateIntake(intake).some((error) => error.includes("unsupported external actions")));
});

test("nightly competitor monitoring is required and fails closed", () => {
  const intake = createEmptyIntake("America/Los_Angeles");
  intake.project_name = "Neutral opportunity";
  intake.market_context = "Research demand in a neutral public market.";
  assert.deepEqual(validateIntake(intake), []);

  intake.competitor_monitoring.timezone = "Not/A-Timezone";
  assert.ok(validateIntake(intake).some((error) => error.includes("nightly competitor monitoring")));

  const inactive = validResult();
  inactive.competitor_monitoring.status = "blocked";
  assert.throws(() => parseRunResult(inactive, "Neutral Market Review"), /monitoring blocker/);
});

test("research outputs remain available when monitoring is honestly blocked", () => {
  const partial = validResult();
  partial.status = "partial";
  partial.competitor_monitoring = {
    ...partial.competitor_monitoring,
    status: "blocked",
    schedule_id: null,
    watch_count: 0,
    next_run_at: null,
    blocker: "No authorized competitor-ad collection adapter is configured.",
  };
  const parsed = parseRunResult(partial, "Neutral Market Review");
  assert.equal(parsed.status, "partial");
  assert.equal(parsed.competitor_monitoring.status, "blocked");
  assert.equal(parsed.outputs.markdown.filename, "neutral-market-review-master-research.md");
});

test("limited research lanes require explicit limitations and a partial result", () => {
  const limited = validResult();
  limited.status = "partial";
  limited.research_coverage.b2b_lead_buyer = {
    status: "limited",
    limitation: "No current primary buyer interviews were available.",
  };
  assert.equal(parseRunResult(limited, "Neutral Market Review").status, "partial");

  limited.research_coverage.b2b_lead_buyer.limitation = null;
  assert.throws(() => parseRunResult(limited, "Neutral Market Review"), /limitation is missing/);
});

test("malformed or expanded intake fields fail closed", () => {
  const malformed = createEmptyIntake();
  malformed.project_name = "Neutral opportunity";
  malformed.market_context = "Research demand in a neutral public market.";
  (malformed.fields as unknown) = null;
  assert.doesNotThrow(() => validateIntake(malformed));
  assert.ok(validateIntake(malformed).some((error) => error.includes("field set")));

  const expanded = createEmptyIntake() as IntelligenceIntake & { fields: IntelligenceIntake["fields"] & { hidden_instruction: { state: "answered"; value: string } } };
  expanded.project_name = "Neutral opportunity";
  expanded.market_context = "Research demand in a neutral public market.";
  expanded.fields.hidden_instruction = { state: "answered", value: "Perform an undeclared action." };
  assert.ok(validateIntake(expanded).some((error) => error.includes("field set")));
});

test("attachment manifests are bounded and path-safe", () => {
  const intake = createEmptyIntake();
  intake.project_name = "Neutral opportunity";
  intake.market_context = "Research demand in a neutral public market.";
  intake.attachments = [{
    name: "../private.txt",
    size: 100,
    type: "text/plain",
    last_modified: 1,
  }];
  assert.ok(validateIntake(intake).some((error) => error.includes("attachment metadata")));

  intake.attachments = Array.from({ length: 6 }, (_, index) => ({
    name: `public-${index}.txt`,
    size: 100,
    type: "text/plain",
    last_modified: index,
  }));
  assert.ok(validateIntake(intake).some((error) => error.includes("no more than five")));
});

test("structural-example markets are rejected from intake and outputs", () => {
  const intake = createEmptyIntake();
  intake.project_name = "Neutral opportunity";
  intake.market_context = "Copy the Lendio business loan example.";
  assert.ok(validateIntake(intake).some((error) => error.includes("structural-example")));

  const result = validResult();
  result.outputs.markdown.content += " Lendio should be treated as a finding.";
  assert.throws(() => parseRunResult(result, "Neutral Market Review"), /structural-example/);
});

test("fake Google IDs, mismatched filenames, and incomplete validations never pass", () => {
  const fakeDoc = validResult();
  fakeDoc.outputs.google_doc.url = "https://example.com/document/doc-123";
  assert.throws(() => parseRunResult(fakeDoc, "Neutral Market Review"), /Google Doc/);

  const wrongFile = validResult();
  wrongFile.outputs.markdown.filename = "summary.md";
  assert.throws(() => parseRunResult(wrongFile, "Neutral Market Review"), /Markdown/);

  const incomplete = validResult();
  (incomplete.validation.markdown_doc_parity as boolean) = false;
  assert.throws(() => parseRunResult(incomplete, "Neutral Market Review"), /validation/);

  const malformed = validResult() as unknown as { outputs: { google_doc: null } };
  malformed.outputs.google_doc = null;
  assert.throws(() => parseRunResult(malformed, "Neutral Market Review"), /Google Doc/);
});
