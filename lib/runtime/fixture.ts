import syntheticFixture from "@/data/fixtures/synthetic-community-workshop.json";
import { generateProjectBrief } from "@/lib/contracts/brief";
import {
  createDocumentContract,
  createLaneRecords,
} from "@/lib/contracts/defaults";
import { scanForExampleLeaks } from "@/lib/contracts/example-leak-scan.mjs";
import { deriveProjectState } from "@/lib/contracts/state-machine";
import type {
  CanonicalIntake,
  FieldStateMap,
  ProjectRecord,
  RunManifest,
} from "@/lib/contracts/types";

type FixtureShape = {
  fixture_label: string;
  project: Omit<ProjectRecord, "intake" | "field_states" | "raw_answers" | "run_manifest">;
  field_states: FieldStateMap;
  raw_answers: Record<string, string>;
  intake: CanonicalIntake;
};

const fixture = syntheticFixture as FixtureShape;

export function createSyntheticProject(): ProjectRecord {
  return {
    ...structuredClone(fixture.project),
    intake: structuredClone(fixture.intake),
    field_states: structuredClone(fixture.field_states),
    raw_answers: structuredClone(fixture.raw_answers),
    run_manifest: null,
  };
}

export function executeDeterministicFixture(
  project: ProjectRecord,
  now = "2026-01-15T12:05:00.000Z",
): RunManifest {
  if (
    !project.is_synthetic_demo ||
    project.id !== fixture.project.id ||
    JSON.stringify(project.intake) !== JSON.stringify(fixture.intake)
  ) {
    throw new Error(
      "Fixture execution is limited to the visibly synthetic demonstration project.",
    );
  }

  const projectBrief = generateProjectBrief(
    project.intake,
    project.field_states,
    project.updated_at.slice(0, 10),
  );
  const lanes = createLaneRecords().map((lane) => {
    const shared = { ...lane, last_updated: now };
    switch (lane.id) {
      case "project_brief":
        return {
          ...shared,
          state: "complete" as const,
          evidence_summary: "Deterministic intake output; no market claims.",
          artifact_ids: ["artifact-00"],
        };
      case "market_awareness":
        return {
          ...shared,
          state: "partial" as const,
          evidence_summary: "Synthetic structure only; no live sources.",
          blocker: "Replace fixture hypotheses with sourced market evidence.",
          artifact_ids: ["artifact-01"],
        };
      case "b2b_buyer_intelligence":
      case "b2c_consumer_intelligence":
      case "lead_product_specification":
        return {
          ...shared,
          state: "partial" as const,
          evidence_summary: "Representative synthetic records only.",
          blocker: "Live research has not run.",
        };
      case "messaging_creative_strategy":
      case "funnel_blueprint":
      case "brand_tone":
        return {
          ...shared,
          state: "blocked" as const,
          evidence_summary: "No creation-ready evidence.",
          blocker: "Upstream buyer, consumer, and competitor evidence is absent.",
        };
      case "competitor_ad_funnel":
      case "master_intelligence":
      case "google_docs_publication":
        return {
          ...shared,
          state: "blocked" as const,
          evidence_summary: "Not executed in fixture mode.",
          blocker:
            lane.id === "google_docs_publication"
              ? "No Google Docs connector or native readback in fixture mode."
              : "Live research has not run.",
        };
      default:
        return shared;
    }
  });

  const documents = createDocumentContract().map((document) => {
    if (document.section_id === "00") {
      return {
        ...document,
        markdown_state: "generated" as const,
        limitation:
          "Markdown is generated from intake. Google Doc is not published.",
      };
    }
    if (document.section_id === "01") {
      return {
        ...document,
        markdown_state: "fixture_preview" as const,
        limitation:
          "Synthetic structure preview only. It contains no market findings.",
      };
    }
    return document;
  });

  const manifest: RunManifest = {
    schema_version: "1.0",
    run_id: "fixture-run-community-workshop",
    project_id: project.id,
    mode: "deterministic_fixture",
    synthetic: true,
    synthetic_label: fixture.fixture_label,
    adapter_version: "1.0.0",
    skill_name: "lead-generation-ads-discovery-intelligence",
    skill_path: null,
    skill_bundle_sha256: null,
    codex_version: null,
    thread_id: null,
    started_at: "2026-01-15T12:04:58.000Z",
    completed_at: now,
    state: deriveProjectState(lanes),
    lanes,
    evidence: [
      {
        evidence_id: "E-SYN-001",
        claim_or_record:
          "The synthetic intake specifies internal lead generation and a form inquiry.",
        evidence_class: "observed",
        audience_side: "both",
        speaker_role: "researcher",
        source_type: "synthetic_intake",
        platform: "workbench",
        principal: "Workbench Demo",
        url_or_path: "fixture://synthetic-community-workshop/intake",
        accessed_at: now,
        represented_date: "Synthetic fixture",
        geography: "Invented",
        query_context: "Deterministic fixture execution",
        excerpt_or_fields:
          "acquisition_model=internal_lead_generation; conversion_unit=form_lead",
        local_capture: "",
        limitation:
          "Observed only from invented fixture input; not external market evidence.",
      },
      {
        evidence_id: "E-SYN-002",
        claim_or_record:
          "A coordinator may need schedule fit and contact preference before reviewing an inquiry.",
        evidence_class: "hypothesis",
        audience_side: "buyer",
        speaker_role: "researcher",
        source_type: "synthetic_fixture",
        platform: "workbench",
        principal: "Invented workshop operator",
        url_or_path: "fixture://synthetic-community-workshop/hypotheses",
        accessed_at: now,
        represented_date: "Synthetic fixture",
        geography: "Invented",
        query_context: "UI demonstration",
        excerpt_or_fields: "Illustrative buyer-side question",
        local_capture: "",
        limitation: "Not observed, corroborated, or suitable for a real decision.",
      },
      {
        evidence_id: "E-SYN-003",
        claim_or_record:
          "A prospective participant may want materials and accessibility details before submitting.",
        evidence_class: "hypothesis",
        audience_side: "consumer",
        speaker_role: "researcher",
        source_type: "synthetic_fixture",
        platform: "workbench",
        principal: "Invented lead audience",
        url_or_path: "fixture://synthetic-community-workshop/hypotheses",
        accessed_at: now,
        represented_date: "Synthetic fixture",
        geography: "Invented",
        query_context: "UI demonstration",
        excerpt_or_fields: "Illustrative consumer-side question",
        local_capture: "",
        limitation: "Not observed, corroborated, or suitable for a real decision.",
      },
    ],
    findings: [
      {
        id: "F-SYN-001",
        title: "Buyer-side question to research",
        statement:
          "Hypothesis: intake requirements should reflect the coordinator’s actual scheduling constraints.",
        evidence_class: "hypothesis",
        evidence_ids: ["E-SYN-001", "E-SYN-002"],
        limitation: "Synthetic demonstration; validate with real buyer evidence.",
        audience_side: "buyer",
      },
      {
        id: "F-SYN-002",
        title: "Consumer-side question to research",
        statement:
          "Hypothesis: clarify what a participant needs to know before asking for workshop details.",
        evidence_class: "hypothesis",
        evidence_ids: ["E-SYN-003"],
        limitation: "Synthetic demonstration; validate with attributable VOC.",
        audience_side: "consumer",
      },
    ],
    artifacts: [
      {
        id: "artifact-00",
        section_id: "00",
        title: "Project Brief",
        markdown_path: "00-project-brief.md",
        markdown: projectBrief,
        state: "generated",
        limitation: null,
      },
      {
        id: "artifact-01",
        section_id: "01",
        title: "Market Awareness — synthetic structure preview",
        markdown_path: "01-market-awareness.md",
        markdown: `# 01 — Market awareness

> SYNTHETIC DEMONSTRATION — NOT RESEARCH

## Buyer side

The fixture shows where buyer awareness analysis would appear. No buyer observations, population estimates, platform records, or commercial evidence were collected.

## Consumer side

The fixture shows where end-customer awareness analysis would appear. No customer language, measured stage distribution, or attributable public evidence was collected.

## Required next evidence

- Attributable buyer-language observations
- Attributable consumer-language observations
- Current market and geography sources
- Platform observability checks

**State:** Partial. Structure demonstrated; findings absent.
`,
        state: "fixture_preview",
        limitation: "Synthetic structure only; contains no research findings.",
      },
    ],
    documents,
    blockers: [
      "Live market research has not run.",
      "No competitor or platform observations exist.",
      "No native Google Docs have been created or read back.",
    ],
    limitations: [
      fixture.fixture_label,
      "Fixture evidence is invented solely to demonstrate review interactions.",
      "No document-manifest.json is created before native Google Docs verification.",
    ],
    validation: {
      schema_valid: true,
      evidence_ids_unique: true,
      external_actions_empty: true,
      example_leak_scan_passed: false,
    },
  };
  const leakScan = scanForExampleLeaks({
    fixture,
    evidence: manifest.evidence,
    findings: manifest.findings,
    artifacts: manifest.artifacts,
  });
  manifest.validation.example_leak_scan_passed = leakScan.passed;
  if (!leakScan.passed) {
    throw new Error(
      `Synthetic fixture contains structural-example material: ${leakScan.matches.join(", ")}`,
    );
  }
  return manifest;
}
