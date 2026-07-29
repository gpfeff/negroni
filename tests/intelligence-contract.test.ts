import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyIntake } from "@/lib/intelligence/defaults";
import { parseRunResult, slugifyProjectName, validateIntake } from "@/lib/intelligence/validation";
import type { RunResult } from "@/lib/intelligence/contracts";

function validResult(projectName = "Neutral Market Review"): RunResult {
  return {
    contract: "lead-generation-intelligence-result",
    contract_version: "2.0",
    run_id: "run-001",
    status: "complete",
    research_engine: "lead-generation-ads-discovery-intelligence",
    completed_at: "2026-07-28T20:00:00.000Z",
    outputs: {
      google_doc: { title: `${projectName} — Main Intelligence Report`, url: "https://docs.google.com/document/d/doc-123/edit", verified: true },
      google_sheet: { title: `${projectName} — Competitor Report`, url: "https://docs.google.com/spreadsheets/d/sheet-123/edit", verified: true },
      markdown: {
        filename: `${slugifyProjectName(projectName)}-main-report.md`,
        mime_type: "text/markdown",
        content: "# Main report\n\n## Executive summary\n\nObserved evidence remains bounded to the cited public record [SRC-1]. Supported inferences, hypotheses, unknowns, recommendations, limitations, unresolved questions, and sources remain explicitly labeled throughout this complete portable report.",
      },
    },
    sources: [{ id: "SRC-1", url: "https://example.com/public-record", title: "Public record", accessed_at: "2026-07-28" }],
    limitations: ["Public evidence was limited in one channel."],
    validation: {
      exactly_three_outputs: true,
      google_doc_readback: true,
      google_sheet_readback: true,
      markdown_doc_parity: true,
      competitor_rows_evidence_backed: true,
      citation_integrity: true,
      secret_scan_passed: true,
      example_leak_scan_passed: true,
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
  assert.equal(result.outputs.google_sheet.title, "Neutral Market Review — Competitor Report");
  assert.equal(result.outputs.markdown.filename, "neutral-market-review-main-report.md");

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
});
