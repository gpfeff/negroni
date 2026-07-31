import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  buildCompetitorResearchArtifacts,
  createCreativeEntryPointer,
  stableJson,
} from "@/lib/competitor-research/handoff";
import { PUBLIC_EVIDENCE_CLAIMS_BOUNDARY } from "@/lib/competitor-research/contracts";

const creativeBrief = {
  contract: "negroni-creative-brief",
  contract_version: "1.0",
  research_revision_id: "rr_fixture_001",
  research_sha256: "a".repeat(64),
  approval_status: "approved",
  competitor_pattern_hypotheses: [{
    hypothesis_id: "hyp_fixture_001",
    pattern: "Clarify the response process before the CTA.",
    evidence_ids: ["EVIDENCE-fixture-ad-001"],
    unknowns: [PUBLIC_EVIDENCE_CLAIMS_BOUNDARY],
    originality_rule: "Create new copy, composition, footage, identity, and proof; do not reproduce competitor assets or claims.",
    human_review_status: "approved",
  }],
};

test("stable JSON omits undefined object values like JSON.stringify", () => {
  assert.equal(stableJson({ kept: 1, omitted: undefined }), '{"kept":1}');
});

test("Creative accepts only an explicitly approved immutable brief fingerprint", () => {
  const serialized = `${stableJson(creativeBrief)}\n`;
  const fingerprint = createHash("sha256").update(serialized).digest("hex");
  const pointer = createCreativeEntryPointer({
    research_revision_id: "rr_fixture_001",
    research_sha256: "a".repeat(64),
    creative_brief: creativeBrief,
    creative_brief_sha256: fingerprint,
    approval_status: "approved",
    approved_at: "2026-07-30T10:00:00.000Z",
    evidence_ids: ["EVIDENCE-fixture-ad-001"],
    unknowns: [PUBLIC_EVIDENCE_CLAIMS_BOUNDARY],
  });
  assert.equal(pointer.approval_status, "approved");
  assert.equal(pointer.creative_brief_sha256, fingerprint);
  assert.match(pointer.originality_rule, /do not reproduce competitor assets or claims/i);
});

test("pending approval and fingerprint drift fail closed", () => {
  const serialized = `${stableJson(creativeBrief)}\n`;
  const fingerprint = createHash("sha256").update(serialized).digest("hex");
  assert.throws(() => createCreativeEntryPointer({
    research_revision_id: "rr_fixture_001",
    research_sha256: "a".repeat(64),
    creative_brief: creativeBrief,
    creative_brief_sha256: fingerprint,
    approval_status: "pending",
    approved_at: "2026-07-30T10:00:00.000Z",
    evidence_ids: [],
    unknowns: [],
  }), /explicitly approved/i);
  assert.throws(() => createCreativeEntryPointer({
    research_revision_id: "rr_fixture_001",
    research_sha256: "a".repeat(64),
    creative_brief: creativeBrief,
    creative_brief_sha256: "b".repeat(64),
    approval_status: "approved",
    approved_at: "2026-07-30T10:00:00.000Z",
    evidence_ids: [],
    unknowns: [],
  }), /fingerprint/i);
});

test("all five Research artifacts cite evidence while excluding competitor execution", () => {
  const bundle = buildCompetitorResearchArtifacts({
    project_id: "fixture-project",
    run_id: "run_fixture_night_2",
    revision_id: "rr_fixture_night_2",
    status: "complete",
    generated_at: "2026-07-30T09:00:00.000Z",
    ads: [{
      ad_record_id: "ad_fixture_001",
      advertiser_name: "Example Signal Studio",
      source_url: "https://example.invalid/ads/fixture-ad-001",
      first_observed_at: "2026-07-29T09:00:00.000Z",
      last_observed_at: "2026-07-30T09:00:00.000Z",
      lifecycle_status: "active",
      public_copy: "=Synthetic competitor copy must not enter Creative",
      creative_family_id: "fam_fixture_001",
    }],
    winner_signals: [{
      score_version: "public-winner-signal-v2",
      ad_record_id: "ad_fixture_001",
      score: 15,
      confidence: "low",
      classification: "insufficient_evidence",
      awarded: {
        observed_durability: 0,
        complete_scan_continuity: 5,
        creative_family_reuse: 0,
        same_offer_across_formats: 0,
        expansion_breadth: 0,
        advertiser_repeated_pattern: 0,
        evidence_completeness: 10,
      },
      unknown_components: ["market expansion was not available"],
      explanation: `Two-night public durability evidence. ${PUBLIC_EVIDENCE_CLAIMS_BOUNDARY}`,
      computed_at: "2026-07-30T09:00:00.000Z",
    }],
    limitations: ["Only two complete fixture nights are available."],
    engine_counts: { ads: 1, observations: 2, content_versions: 2, media_objects: 1, creative_families: 1 },
    projection: { kind: "fake", status: "complete", readback_verified: true },
  });

  assert.deepEqual(Object.keys(bundle).sort(), ["creative_brief", "evidence_index", "opportunity_map", "research_brief", "research_receipt"]);
  assert.equal((bundle.evidence_index.competitor_ads as { entries: unknown[] }).entries.length, 1);
  assert.equal((bundle.creative_brief as { approval_status: string }).approval_status, "pending");
  assert.match(JSON.stringify(bundle.creative_brief), /Create new copy, composition, footage, identity, and proof/);
  assert.doesNotMatch(JSON.stringify(bundle.creative_brief), /Synthetic competitor copy/);
  assert.match(bundle.research_brief, /public durability/i);
  assert.match(JSON.stringify(bundle), /does not prove spend, conversions, CPA, ROAS, revenue, profit/i);
});
