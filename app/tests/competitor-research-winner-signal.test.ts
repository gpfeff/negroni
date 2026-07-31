import assert from "node:assert/strict";
import test from "node:test";
import { computePublicWinnerSignal } from "@/lib/competitor-research/winner-signal";

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    ad_record_id: "ad_fixture_001",
    distinct_eligible_observation_days: 0,
    successful_eligible_observations: 0,
    related_family_ad_ids: 1,
    verified_offer_formats: null,
    verified_placements: null,
    verified_markets: null,
    verified_landing_page_expansions: null,
    repeated_pattern_families: null,
    exact_stable_identity: true,
    latest_scan_complete: true,
    required_source_hashes_present: true,
    media_or_unavailable_reason_present: true,
    unresolved_coverage_gap: false,
    contradictory_evidence: false,
    identity_confidence: "high" as const,
    computed_at: "2026-07-30T09:00:00.000Z",
    ...overrides,
  };
}

test("v2 observed-durability boundaries are exact at 4, 7, 14, and 30 days", () => {
  const cases = [[3, 0], [4, 5], [7, 10], [14, 20], [30, 30], [45, 30]] as const;
  for (const [days, expected] of cases) {
    const signal = computePublicWinnerSignal(evidence({ distinct_eligible_observation_days: days }));
    assert.equal(signal.awarded.observed_durability, expected, `${days} days`);
  }
});

test("v2 continuity and family-reuse boundaries use literal component weights", () => {
  const continuityCases = [[1, 0], [2, 5], [4, 10], [7, 15], [14, 20]] as const;
  for (const [observations, expected] of continuityCases) {
    assert.equal(
      computePublicWinnerSignal(evidence({ successful_eligible_observations: observations })).awarded.complete_scan_continuity,
      expected,
    );
  }
  const familyCases = [[1, 0], [2, 5], [3, 10], [4, 15], [8, 15]] as const;
  for (const [members, expected] of familyCases) {
    assert.equal(
      computePublicWinnerSignal(evidence({ related_family_ad_ids: members })).awarded.creative_family_reuse,
      expected,
    );
  }
});

test("unsupported signal families remain unknown and never normalize the score upward", () => {
  const signal = computePublicWinnerSignal(evidence({
    distinct_eligible_observation_days: 7,
    successful_eligible_observations: 7,
  }));
  assert.equal(signal.score, 35);
  assert.deepEqual(signal.unknown_components, [
    "same offer across formats was not available",
    "placement expansion was not available",
    "market expansion was not available",
    "landing-page expansion was not available",
    "advertiser repeated-pattern evidence was not available",
  ]);
});

test("low or unknown confidence suppresses classification regardless of points", () => {
  const low = computePublicWinnerSignal(evidence({
    distinct_eligible_observation_days: 30,
    successful_eligible_observations: 14,
    related_family_ad_ids: 4,
    verified_offer_formats: 3,
    verified_placements: 3,
    verified_markets: 3,
    verified_landing_page_expansions: 3,
    repeated_pattern_families: 2,
    identity_confidence: "low",
  }));
  assert.equal(low.score, 100);
  assert.equal(low.confidence, "low");
  assert.equal(low.classification, "insufficient_evidence");

  const unknown = computePublicWinnerSignal(evidence({ exact_stable_identity: false }));
  assert.equal(unknown.confidence, "unknown");
  assert.equal(unknown.classification, "insufficient_evidence");
});

test("signal explanations state the versioned non-performance boundary", () => {
  const signal = computePublicWinnerSignal(evidence({
    distinct_eligible_observation_days: 9,
    successful_eligible_observations: 7,
    related_family_ad_ids: 2,
  }));
  assert.equal(signal.score_version, "public-winner-signal-v2");
  assert.match(signal.explanation, /public durability evidence/i);
  assert.match(signal.explanation, /does not prove spend, conversions, CPA, ROAS, revenue, profit/i);
  assert.doesNotMatch(signal.explanation, /is a verified winner/i);
});
