import {
  PUBLIC_EVIDENCE_CLAIMS_BOUNDARY,
  WINNER_SIGNAL_VERSION,
  type EvidenceConfidence,
  type WinnerSignal,
  type WinnerSignalComponents,
} from "./contracts.ts";
import { assertPublicEvidenceClaims } from "./validation.ts";

export type PublicWinnerSignalEvidence = {
  ad_record_id: string;
  distinct_eligible_observation_days: number;
  successful_eligible_observations: number;
  related_family_ad_ids: number;
  verified_offer_formats: number | null;
  verified_placements: number | null;
  verified_markets: number | null;
  verified_landing_page_expansions: number | null;
  repeated_pattern_families: number | null;
  exact_stable_identity: boolean;
  latest_scan_complete: boolean;
  required_source_hashes_present: boolean;
  media_or_unavailable_reason_present: boolean;
  unresolved_coverage_gap: boolean;
  contradictory_evidence: boolean;
  identity_confidence: "high" | "medium" | "low";
  computed_at: string;
};

function threshold(value: number, boundaries: ReadonlyArray<readonly [number, number]>): number {
  let awarded = 0;
  for (const [minimum, points] of boundaries) if (value >= minimum) awarded = points;
  return awarded;
}

function boundedCount(value: number | null): number {
  return value === null || !Number.isInteger(value) || value < 0 ? 0 : value;
}

function confidenceFor(evidence: PublicWinnerSignalEvidence): EvidenceConfidence {
  if (evidence.contradictory_evidence
    || !evidence.exact_stable_identity
    || evidence.distinct_eligible_observation_days === 0) return "unknown";
  if (evidence.identity_confidence === "low"
    || evidence.distinct_eligible_observation_days < 4
    || evidence.unresolved_coverage_gap
    || !evidence.latest_scan_complete) return "low";
  if (evidence.identity_confidence === "high"
    && evidence.distinct_eligible_observation_days >= 7
    && evidence.required_source_hashes_present) return "high";
  return "medium";
}

function classification(score: number, confidence: EvidenceConfidence): WinnerSignal["classification"] {
  if (confidence === "low" || confidence === "unknown") return "insufficient_evidence";
  if (score <= 24) return "limited_signal";
  if (score <= 49) return "emerging_durability";
  if (score <= 69) return "durable_public_pattern";
  return "strong_public_durability";
}

export function computePublicWinnerSignal(evidence: PublicWinnerSignalEvidence): WinnerSignal {
  const numericValues = [
    evidence.distinct_eligible_observation_days,
    evidence.successful_eligible_observations,
    evidence.related_family_ad_ids,
  ];
  if (numericValues.some((value) => !Number.isInteger(value) || value < 0)
    || !Number.isFinite(Date.parse(evidence.computed_at))) {
    throw new Error("Winner-signal evidence contains invalid counts or time.");
  }

  const unknown: string[] = [];
  if (evidence.verified_offer_formats === null) unknown.push("same offer across formats was not available");
  if (evidence.verified_placements === null) unknown.push("placement expansion was not available");
  if (evidence.verified_markets === null) unknown.push("market expansion was not available");
  if (evidence.verified_landing_page_expansions === null) unknown.push("landing-page expansion was not available");
  if (evidence.repeated_pattern_families === null) unknown.push("advertiser repeated-pattern evidence was not available");

  const expansionPoints = Math.min(10, 3 * (
    Math.max(0, boundedCount(evidence.verified_placements) - 1)
    + Math.max(0, boundedCount(evidence.verified_markets) - 1)
    + Math.max(0, boundedCount(evidence.verified_landing_page_expansions) - 1)
  ));
  const awarded: WinnerSignalComponents = {
    observed_durability: threshold(evidence.distinct_eligible_observation_days, [[4, 5], [7, 10], [14, 20], [30, 30]]),
    complete_scan_continuity: threshold(evidence.successful_eligible_observations, [[2, 5], [4, 10], [7, 15], [14, 20]]),
    creative_family_reuse: threshold(evidence.related_family_ad_ids, [[2, 5], [3, 10], [4, 15]]),
    same_offer_across_formats: threshold(boundedCount(evidence.verified_offer_formats), [[2, 5], [3, 10]]),
    expansion_breadth: expansionPoints,
    advertiser_repeated_pattern: boundedCount(evidence.repeated_pattern_families) >= 2 ? 5 : 0,
    evidence_completeness: (evidence.exact_stable_identity ? 3 : 0)
      + (evidence.latest_scan_complete ? 3 : 0)
      + (evidence.required_source_hashes_present ? 2 : 0)
      + (evidence.media_or_unavailable_reason_present ? 2 : 0),
  };
  const score = Object.values(awarded).reduce((total, points) => total + points, 0);
  const confidence = confidenceFor(evidence);
  const explanation = [
    `Observed on ${evidence.distinct_eligible_observation_days} distinct eligible day${evidence.distinct_eligible_observation_days === 1 ? "" : "s"}`,
    `across ${evidence.successful_eligible_observations} complete check${evidence.successful_eligible_observations === 1 ? "" : "s"}`,
    `with ${Math.max(0, evidence.related_family_ad_ids - 1)} related same-advertiser variant${Math.max(0, evidence.related_family_ad_ids - 1) === 1 ? "" : "s"}.`,
    unknown.length ? `${unknown.length} signal component${unknown.length === 1 ? " remains" : "s remain"} unknown.` : "All configured signal components were observed.",
    `This is public durability evidence; ${PUBLIC_EVIDENCE_CLAIMS_BOUNDARY.replace(/^Observed public durability /, "it ")}`,
  ].join(" ");
  assertPublicEvidenceClaims(explanation);
  return {
    score_version: WINNER_SIGNAL_VERSION,
    ad_record_id: evidence.ad_record_id,
    score,
    confidence,
    classification: classification(score, confidence),
    awarded,
    unknown_components: unknown,
    explanation,
    computed_at: new Date(evidence.computed_at).toISOString(),
  };
}
