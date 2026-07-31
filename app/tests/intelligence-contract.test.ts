import assert from "node:assert/strict";
import test from "node:test";
import {
  PROMPT_SOURCE_DOCUMENT_ID,
  RESEARCH_PROMPTS,
  type IntelligenceIntake,
  type RunResult,
} from "@/lib/intelligence/contracts";
import { createEmptyIntake } from "@/lib/intelligence/defaults";
import {
  buildResearchName,
  parseRunResult,
  slugifyProjectName,
  validateIntake,
} from "@/lib/intelligence/validation";

const RESEARCH_NAME = "Regional repair leads (United States)";

function completePromptReceipts(): RunResult["prompt_execution"]["prompts"] {
  return Object.fromEntries(RESEARCH_PROMPTS.map((prompt) => [
    prompt,
    { status: "complete", limitation: null },
  ])) as RunResult["prompt_execution"]["prompts"];
}

function validIntake(): IntelligenceIntake {
  const intake = createEmptyIntake("America/Los_Angeles");
  intake.client_customer_name = "Jordan Lee";
  intake.profession_job_title = "Operations director";
  intake.company_name = "Regional Repair Co.";
  intake.website_or_public_profile_url = "https://regional-repair.example";
  intake.service_or_offer_purchased = "Emergency repair membership";
  intake.competitor_used = "Local repair marketplace";
  intake.offer_or_lead_type = "Regional repair leads";
  intake.industry = "Home services";
  intake.country_region = "United States";
  intake.target_age_range = "30–60";
  return intake;
}

function validResult(researchName = RESEARCH_NAME): RunResult {
  return {
    contract: "lead-generation-intelligence-result",
    contract_version: "4.0",
    run_id: "run-001",
    status: "complete",
    research_engine: "lead-generation-ads-discovery-intelligence",
    completed_at: "2026-07-29T20:00:00.000Z",
    outputs: {
      google_doc: {
        title: `${researchName} — Master Research`,
        url: "https://docs.google.com/document/d/doc-123/edit",
        verified: true,
      },
      google_sheet: {
        title: `${researchName} — Competitor Ads`,
        status: "published",
        url: "https://docs.google.com/spreadsheets/d/sheet-123/edit",
        verified: true,
      },
      markdown: {
        filename: `${slugifyProjectName(researchName)}-master-research.md`,
        mime_type: "text/markdown",
        content: "# Master research\n\nThe evidence-backed market analysis remains bounded to the cited public record [SRC-1]. Findings, inferences, recommendations, limitations, and unresolved questions remain explicitly labeled throughout the complete report.",
      },
    },
    sources: [{
      id: "SRC-1",
      url: "https://example.com/public-record",
      title: "Public record",
      accessed_at: "2026-07-29",
    }],
    limitations: ["Public evidence was limited in one channel."],
    prompt_execution: {
      source_document_id: PROMPT_SOURCE_DOCUMENT_ID,
      source_modified_at: "2026-07-29T08:24:08.962Z",
      prompts: completePromptReceipts(),
    },
    competitor_monitoring: {
      engine: "meta-ads-intelligence",
      cadence: "nightly",
      local_time: "02:17",
      timezone: "America/Los_Angeles",
      status: "active",
      schedule_id: "schedule-regional-repair",
      watch_count: 3,
      last_run_at: null,
      next_run_at: "2026-07-30T09:17:00.000Z",
      blocker: null,
    },
    competitor_ads: {
      engine: "meta-ads-intelligence",
      profile: "negroni-regional-repair-0123456789ab",
      refresh_status: "complete",
      last_successful_refresh_at: "2026-07-29T19:55:00.000Z",
      watched_competitors: 3,
      active_ads: 14,
      new_ads_today: 2,
      changed_ads: 1,
      creative_families: 6,
      possibly_no_longer_active: 1,
      reactivated_ads: 0,
      landing_page_changes: 1,
      coverage_limitations: ["One keyword watch remains discovery-only."],
      claims_boundary: "Observed longevity and recurrence are evidence only; they do not prove spend, conversions, CTR, CPA, ROAS, or profitability.",
      links: {
        database: "https://runner.example.com/projects/run-001/competitor-ads/database",
        report_markdown: "https://runner.example.com/projects/run-001/competitor-ads/report.md",
        report_csv: "https://runner.example.com/projects/run-001/competitor-ads/report.csv",
        google_sheet: "https://docs.google.com/spreadsheets/d/sheet-123/edit",
      },
    },
    research_artifacts: {
      research_brief: { filename: "research-brief.md", sha256: "a".repeat(64), verified: true },
      evidence_index: { filename: "evidence-index.json", sha256: "b".repeat(64), verified: true },
      opportunity_map: { filename: "opportunity-map.json", sha256: "c".repeat(64), verified: true },
      creative_brief: { filename: "creative-brief.json", sha256: "d".repeat(64), verified: true },
      research_receipt: { filename: "research-receipt.json", sha256: "e".repeat(64), verified: true },
    },
    validation: {
      exactly_three_outputs: true,
      google_doc_readback: true,
      google_sheet_projection_checked: true,
      markdown_doc_parity: true,
      competitor_rows_evidence_backed: true,
      citation_integrity: true,
      secret_scan_passed: true,
      example_leak_scan_passed: true,
      five_prompt_sequence_verified: true,
      competitor_monitor_receipt_verified: true,
      competitor_ads_intelligence_verified: true,
      research_artifacts_verified: true,
    },
  };
}

test("the intake requires the customer profile before research scope", () => {
  const intake = createEmptyIntake();
  assert.equal(intake.create_competitor_database, false);
  assert.equal(intake.competitor_monitoring.enabled, false);
  assert.match(intake.approved_prompt, /1\).*Market Awareness[\s\S]*4A\).*Master Research[\s\S]*4B\).*Brand Tone/i);
  assert.deepEqual(validateIntake(intake), [
    "Enter the client or customer name.",
    "Enter the profession or job title.",
    "Enter the company name.",
    "Enter an HTTPS website or public profile URL.",
    "Describe the service or offer purchased.",
    "Describe the lead offer or service.",
    "Enter the industry or niche.",
    "Enter the location or market served.",
    "Enter a target age range such as 30–60.",
  ]);
  assert.deepEqual(validateIntake(validIntake()), []);
});

test("target age range accepts common delimiters and rejects invalid bounds", () => {
  const intake = validIntake();
  for (const range of ["30-60", "30–60", "30 to 60"]) {
    intake.target_age_range = range;
    assert.deepEqual(validateIntake(intake), []);
  }
  for (const range of ["60–30", "0–60", "30+", "30–121"]) {
    intake.target_age_range = range;
    assert.ok(validateIntake(intake).some((error) => error.includes("target age range")));
  }
});

test("research names derive deterministically from offer and region", () => {
  assert.equal(buildResearchName("  Regional   repair leads ", " United States "), RESEARCH_NAME);
});

test("successful output contract has exactly three outward actions", () => {
  const result = parseRunResult(validResult(), RESEARCH_NAME);
  assert.deepEqual(Object.keys(result.outputs).sort(), ["google_doc", "google_sheet", "markdown"]);
  assert.equal(result.outputs.google_sheet.title, `${RESEARCH_NAME} — Competitor Ads`);

  const extra = validResult() as RunResult & { outputs: RunResult["outputs"] & { evidence: object } };
  extra.outputs.evidence = {};
  assert.throws(() => parseRunResult(extra, RESEARCH_NAME), /exactly three/);
});

test("Google Sheet projection is optional while local competitor reports remain available", () => {
  const localOnly = validResult();
  localOnly.outputs.google_sheet = {
    title: `${RESEARCH_NAME} — Competitor Ads`,
    status: "not_configured",
    url: null,
    verified: false,
    message: "Google publishing not configured.",
  };
  localOnly.competitor_ads.links.google_sheet = null;
  const parsed = parseRunResult(localOnly, RESEARCH_NAME);
  assert.equal(parsed.outputs.google_sheet.status, "not_configured");
  assert.ok(parsed.competitor_ads.links.report_markdown);
});

test("the exact source document and five-prompt order are enforced", () => {
  const intake = validIntake();
  (intake.prompt_source.document_id as string) = "different-document";
  assert.ok(validateIntake(intake).some((error) => error.includes("five-prompt")));

  const reordered = validIntake();
  reordered.prompt_source.prompt_ids = [...RESEARCH_PROMPTS].reverse() as unknown as typeof RESEARCH_PROMPTS;
  assert.ok(validateIntake(reordered).some((error) => error.includes("five-prompt")));

  const missingReceipt = validResult();
  delete (missingReceipt.prompt_execution.prompts as Partial<RunResult["prompt_execution"]["prompts"]>).brand_tone_of_voice;
  assert.throws(() => parseRunResult(missingReceipt, RESEARCH_NAME), /five-prompt/);
});

test("secret-bearing intake is rejected before execution", () => {
  const intake = validIntake();
  intake.offer_or_lead_type = "api_key=abc123456789012345";
  assert.ok(validateIntake(intake).some((error) => error.includes("credential-like")));
});

test("tampered research authority is rejected before reaching the runner", () => {
  const intake = validIntake();
  (intake.research_engine as string) = "unapproved-research-engine";
  assert.ok(validateIntake(intake).some((error) => error.includes("canonical research engine")));

  intake.research_engine = "lead-generation-ads-discovery-intelligence";
  (intake.allowed_actions as unknown as string[]).push("submit_forms");
  assert.ok(validateIntake(intake).some((error) => error.includes("unsupported external actions")));
});

test("nightly competitor monitoring is required and fails closed", () => {
  const intake = validIntake();
  intake.competitor_monitoring.timezone = "Not/A-Timezone";
  assert.ok(validateIntake(intake).some((error) => error.includes("nightly competitor monitoring")));

  const inactive = validResult();
  inactive.competitor_monitoring.status = "blocked";
  assert.throws(() => parseRunResult(inactive, RESEARCH_NAME), /monitoring blocker|status/);
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
  partial.competitor_ads.refresh_status = "skipped";
  partial.competitor_ads.last_successful_refresh_at = null;
  partial.competitor_ads.coverage_limitations = [
    "No authorized competitor-ad collection adapter is configured.",
  ];
  const parsed = parseRunResult(partial, RESEARCH_NAME);
  assert.equal(parsed.status, "partial");
  assert.equal(parsed.competitor_monitoring.status, "blocked");
});

test("competitor-ad summary and all five durable artifact receipts are required", () => {
  const valid = parseRunResult(validResult(), RESEARCH_NAME);
  assert.equal(valid.competitor_ads.new_ads_today, 2);
  assert.deepEqual(Object.values(valid.research_artifacts).map((item) => item.filename), [
    "research-brief.md",
    "evidence-index.json",
    "opportunity-map.json",
    "creative-brief.json",
    "research-receipt.json",
  ]);

  const missingArtifact = validResult() as unknown as {
    research_artifacts: Partial<RunResult["research_artifacts"]>;
  };
  delete (missingArtifact.research_artifacts as Record<string, unknown>).creative_brief;
  assert.throws(() => parseRunResult(missingArtifact, RESEARCH_NAME), /five durable Research artifact/);

  const localPathLeak = validResult();
  localPathLeak.competitor_ads.links.database = "file:///private/meta-ads.sqlite3";
  assert.throws(() => parseRunResult(localPathLeak, RESEARCH_NAME), /links/);
});

test("limited prompt work requires an explicit limitation and partial status", () => {
  const limited = validResult();
  limited.status = "partial";
  limited.prompt_execution.prompts.competitor_research = {
    status: "limited",
    limitation: "No current ads were available for one public competitor.",
  };
  assert.equal(parseRunResult(limited, RESEARCH_NAME).status, "partial");

  limited.prompt_execution.prompts.competitor_research.limitation = null;
  assert.throws(() => parseRunResult(limited, RESEARCH_NAME), /limitation is missing/);
});

test("citation integrity rejects unresolved or absent source references", () => {
  const unresolved = validResult();
  unresolved.outputs.markdown.content += " Unsupported reference [SRC-2].";
  assert.throws(() => parseRunResult(unresolved, RESEARCH_NAME), /citations/);

  const absent = validResult();
  absent.outputs.markdown.content = absent.outputs.markdown.content.replace(" [SRC-1]", "");
  assert.throws(() => parseRunResult(absent, RESEARCH_NAME), /citations/);
});

test("expanded intake fields and structural-example output material fail closed", () => {
  const expanded = validIntake() as IntelligenceIntake & { hidden_instruction: string };
  expanded.hidden_instruction = "Perform an undeclared action.";
  assert.ok(validateIntake(expanded).some((error) => error.includes("unsupported fields")));

  const result = validResult();
  result.outputs.markdown.content += " Lendio should be treated as a finding.";
  assert.throws(() => parseRunResult(result, RESEARCH_NAME), /structural-example/);
});

test("fake Google IDs, mismatched filenames, and incomplete validations never pass", () => {
  const fakeDoc = validResult();
  fakeDoc.outputs.google_doc.url = "https://example.com/document/doc-123";
  assert.throws(() => parseRunResult(fakeDoc, RESEARCH_NAME), /Google Doc/);

  const wrongFile = validResult();
  wrongFile.outputs.markdown.filename = "summary.md";
  assert.throws(() => parseRunResult(wrongFile, RESEARCH_NAME), /Markdown/);

  const incomplete = validResult();
  (incomplete.validation.markdown_doc_parity as boolean) = false;
  assert.throws(() => parseRunResult(incomplete, RESEARCH_NAME), /validation/);

  const malformed = validResult() as unknown as { outputs: { google_doc: null } };
  malformed.outputs.google_doc = null;
  assert.throws(() => parseRunResult(malformed, RESEARCH_NAME), /Google Doc/);
});
