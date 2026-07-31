import { createHash } from "node:crypto";
import {
  COMPETITOR_RESEARCH_CONTRACT_VERSION,
  PUBLIC_EVIDENCE_CLAIMS_BOUNDARY,
  type ResearchCreativeHandoff,
  type RunState,
  type WinnerSignal,
} from "./contracts.ts";
import { assertPublicEvidenceClaims } from "./validation.ts";
import type { ResearchArtifactBundle } from "../meta-ads/contracts.ts";

const SHA256_RE = /^[a-f0-9]{64}$/;
const ORIGINALITY_RULE = "Create new copy, composition, footage, identity, and proof; do not reproduce competitor assets or claims.";

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function createCreativeEntryPointer(input: {
  research_revision_id: string;
  research_sha256: string;
  creative_brief: Record<string, unknown>;
  creative_brief_sha256: string;
  approval_status: "pending" | "approved" | "rejected";
  approved_at: string;
  evidence_ids: string[];
  unknowns: string[];
}): ResearchCreativeHandoff {
  if (input.approval_status !== "approved" || input.creative_brief.approval_status !== "approved") {
    throw new Error("Creative requires an explicitly approved Research revision.");
  }
  if (!input.research_revision_id.trim()
    || input.creative_brief.research_revision_id !== input.research_revision_id
    || input.creative_brief.research_sha256 !== input.research_sha256
    || !SHA256_RE.test(input.research_sha256)
    || !Number.isFinite(Date.parse(input.approved_at))) {
    throw new Error("The approved Research revision pointer is invalid.");
  }
  const actual = sha256(`${stableJson(input.creative_brief)}\n`);
  if (!SHA256_RE.test(input.creative_brief_sha256) || actual !== input.creative_brief_sha256) {
    throw new Error("The approved creative-brief fingerprint does not match its immutable content.");
  }
  const evidenceIds = [...new Set(input.evidence_ids.map((id) => id.trim()).filter(Boolean))].sort();
  const unknowns = [...new Set(input.unknowns.map((item) => item.trim()).filter(Boolean))].sort();
  for (const unknown of unknowns) assertPublicEvidenceClaims(unknown);
  return {
    contract: "negroni-research-creative-handoff",
    contract_version: COMPETITOR_RESEARCH_CONTRACT_VERSION,
    research_revision_id: input.research_revision_id,
    research_sha256: input.research_sha256,
    creative_brief_sha256: actual,
    approval_status: "approved",
    evidence_ids: evidenceIds,
    unknowns,
    originality_rule: ORIGINALITY_RULE,
    approved_at: new Date(input.approved_at).toISOString(),
  };
}

type ArtifactAd = {
  ad_record_id: string;
  advertiser_name: string;
  source_url: string;
  first_observed_at: string;
  last_observed_at: string;
  lifecycle_status: string;
  public_copy?: string;
  creative_family_id: string | null;
};

export function buildCompetitorResearchArtifacts(input: {
  project_id: string;
  run_id: string;
  revision_id: string;
  status: Extract<RunState, "complete" | "complete_zero" | "partial" | "suspect" | "blocked" | "skipped" | "failed">;
  generated_at: string;
  ads: ArtifactAd[];
  winner_signals: WinnerSignal[];
  limitations: string[];
  engine_counts: Record<string, number>;
  projection: { kind: "fake" | "not_configured"; status: string; readback_verified: boolean };
}): ResearchArtifactBundle {
  if (!input.project_id.trim() || !input.run_id.trim() || !input.revision_id.trim() || !Number.isFinite(Date.parse(input.generated_at))) {
    throw new Error("Research artifact identity is invalid.");
  }
  for (const limitation of input.limitations) assertPublicEvidenceClaims(limitation);
  for (const signal of input.winner_signals) assertPublicEvidenceClaims(signal.explanation);

  const evidence = input.ads.map((ad) => ({
    id: `EVIDENCE-${ad.ad_record_id}`,
    evidence_type: "public_competitor_ad_observation",
    ad_record_id: ad.ad_record_id,
    advertiser_name: ad.advertiser_name,
    source_url: ad.source_url,
    first_observed_at: ad.first_observed_at,
    last_observed_at: ad.last_observed_at,
    lifecycle_status: ad.lifecycle_status,
    creative_family_id: ad.creative_family_id,
    claim_scope: PUBLIC_EVIDENCE_CLAIMS_BOUNDARY,
  }));
  const evidenceIds = evidence.map((entry) => entry.id);
  const familyEvidence = new Map<string, string[]>();
  for (const ad of input.ads) {
    if (!ad.creative_family_id) continue;
    familyEvidence.set(ad.creative_family_id, [
      ...(familyEvidence.get(ad.creative_family_id) ?? []),
      `EVIDENCE-${ad.ad_record_id}`,
    ]);
  }
  const hypotheses = [...familyEvidence.entries()].map(([familyId, ids], index) => ({
    hypothesis_id: `hyp_${sha256(`${input.revision_id}:${familyId}`).slice(0, 16)}`,
    family_id: familyId,
    pattern: "Test an original proof-and-process sequence derived from the observed public pattern.",
    why_test: "The same fictitious advertiser reused a related public creative family; the strategic ordering may merit an original test.",
    evidence_ids: ids.sort(),
    unknowns: [PUBLIC_EVIDENCE_CLAIMS_BOUNDARY],
    originality_rule: ORIGINALITY_RULE,
    proposed_test: { variable: `pattern-order-${index + 1}`, primary_metric: "to be declared in Iteration" },
    human_review_status: "needs_review",
  }));
  const revisionSha = sha256(stableJson({
    project_id: input.project_id,
    run_id: input.run_id,
    evidence,
    winner_signals: input.winner_signals,
    limitations: input.limitations,
  }));
  const signalLines = input.winner_signals.length
    ? input.winner_signals.map((signal) => `- ${signal.ad_record_id}: ${signal.classification} (${signal.score}/100, ${signal.confidence} confidence). ${signal.explanation}`)
    : ["- No public winner signal is available; signal components remain unknown."];
  const researchBrief = [
    "# Research brief",
    "",
    "## Competitor evidence",
    "",
    `This fixture-backed Research revision contains ${evidence.length} public competitor-ad evidence item${evidence.length === 1 ? "" : "s"}.`,
    ...signalLines,
    "",
    PUBLIC_EVIDENCE_CLAIMS_BOUNDARY,
    "",
    "## Limitations",
    "",
    ...(input.limitations.length ? input.limitations.map((item) => `- ${item}`) : ["- No additional limitation was recorded."]),
    "",
  ].join("\n");
  const creativeBrief = {
    contract: "negroni-creative-brief",
    contract_version: COMPETITOR_RESEARCH_CONTRACT_VERSION,
    research_revision_id: input.revision_id,
    research_sha256: revisionSha,
    approval_status: "pending",
    competitor_pattern_hypotheses: hypotheses,
    evidence_ids: evidenceIds,
    unknowns: [PUBLIC_EVIDENCE_CLAIMS_BOUNDARY, ...input.limitations],
    approval_boundary: "A person must approve this exact revision and fingerprint before Creative can consume it.",
  };
  return {
    research_brief: researchBrief,
    evidence_index: {
      contract: "negroni-evidence-index",
      contract_version: COMPETITOR_RESEARCH_CONTRACT_VERSION,
      project_id: input.project_id,
      revision_id: input.revision_id,
      competitor_ads: { entries: evidence, limitations: input.limitations },
    },
    opportunity_map: {
      contract: "negroni-opportunity-map",
      contract_version: COMPETITOR_RESEARCH_CONTRACT_VERSION,
      revision_id: input.revision_id,
      competitor_pattern_hypotheses: hypotheses,
      winner_signals: input.winner_signals,
      claims_boundary: PUBLIC_EVIDENCE_CLAIMS_BOUNDARY,
    },
    creative_brief: creativeBrief,
    research_receipt: {
      contract: "negroni-research-receipt",
      contract_version: COMPETITOR_RESEARCH_CONTRACT_VERSION,
      project_id: input.project_id,
      run_id: input.run_id,
      revision_id: input.revision_id,
      revision_sha256: revisionSha,
      status: input.status,
      generated_at: input.generated_at,
      engine_counts: input.engine_counts,
      projection: input.projection,
      evidence_count: evidence.length,
      winner_signal_version: "public-winner-signal-v2",
      limitations: input.limitations,
      claims_boundary: PUBLIC_EVIDENCE_CLAIMS_BOUNDARY,
      creative_handoff: { status: "approval_required", approved_revision: null },
    },
  };
}
