import assert from "node:assert/strict";
import test from "node:test";
import {
  canAdvanceLifecycle,
  canonicalEvidenceUrl,
  validateNormalizedAd,
  validateRootRouting,
  assertPublicEvidenceClaims,
} from "@/lib/competitor-research/validation";
import { stableAdIdentity } from "@/lib/competitor-research/ids";

test("stable public IDs produce repeatable high-confidence internal identities", () => {
  const first = stableAdIdentity({
    platform: "meta",
    provider: "normalized_import",
    public_ad_id: "fixture-ad-001",
    stable_source_locator: null,
    content_locator: null,
  });
  const second = stableAdIdentity({
    platform: "meta",
    provider: "normalized_import",
    public_ad_id: "fixture-ad-001",
    stable_source_locator: null,
    content_locator: null,
  });

  assert.equal(first.ad_record_id, second.ad_record_id);
  assert.equal(first.identity_basis, "platform_public_ad_id");
  assert.equal(first.identity_confidence, "high");
  assert.equal(first.low_confidence_reason, null);
  assert.match(first.full_identity_sha256, /^[a-f0-9]{64}$/);
});

test("content-only identities stay explicitly low confidence and cannot auto-merge", () => {
  const identity = stableAdIdentity({
    platform: "other",
    provider: "normalized_import",
    public_ad_id: null,
    stable_source_locator: null,
    content_locator: "https://example.invalid/evidence/card-1",
  });

  assert.equal(identity.identity_basis, "content_locator");
  assert.equal(identity.identity_confidence, "low");
  assert.equal(identity.auto_merge_allowed, false);
  assert.match(identity.low_confidence_reason ?? "", /stable public or source ID/i);
});

test("evidence URLs are HTTPS, canonical, and free of tracking parameters", () => {
  assert.equal(
    canonicalEvidenceUrl("https://example.invalid/path?utm_source=test&b=2&a=1#fragment"),
    "https://example.invalid/path?a=1&b=2",
  );
  assert.throws(() => canonicalEvidenceUrl("http://example.invalid/path"), /HTTPS/);
});

test("normalized ads require explicit identity reasons and null-plus-reason unknowns", () => {
  const valid = validateNormalizedAd({
    contract: "negroni-normalized-ad",
    contract_version: "1.0",
    project_id: "fixture-project",
    ad_record_id: "ad_5be2470b7f285e7e",
    platform: "meta",
    provider: "normalized_import",
    public_ad_id: null,
    identity_basis: "content_locator",
    identity_confidence: "low",
    identity_reason: "No stable public or source ID was supplied; this observation is not auto-merged.",
    advertiser_id: "fixture-advertiser-001",
    advertiser_name: "Example Signal Studio",
    competitor_id: "cmp_1d34aa5b70f5e203",
    source_url: "https://example.invalid/evidence/card-1",
    first_observed_at: "2026-07-29T09:00:00.000Z",
    last_observed_at: "2026-07-29T09:00:00.000Z",
    lifecycle_status: "unknown",
    successful_observations: 1,
    missed_eligible_observations: 0,
    days_observed_active: 1,
    observed_span_days: 1,
    copy: { value: null, reason: "source_field_unavailable" },
    headline: { value: null, reason: "source_field_unavailable" },
    cta: { value: null, reason: "source_field_unavailable" },
    landing_page_url: { value: null, reason: "source_field_unavailable" },
    creative_format: { value: null, reason: "not_classified" },
    content_version_id: "acv_09aaf9e291e8ec37",
    creative_family_id: null,
    collection_status: "complete",
    evidence_confidence: "low",
    limitations: ["Public evidence does not prove spend, conversions, CPA, ROAS, revenue, or profit."],
    source_payload_sha256: "a".repeat(64),
  });
  assert.equal(valid.identity_confidence, "low");

  assert.throws(
    () => validateNormalizedAd({ ...valid, identity_reason: null }),
    /identity reason/i,
  );
  assert.throws(
    () => validateNormalizedAd({ ...valid, copy: { value: null, reason: null } }),
    /unknown reason/i,
  );
});

test("only complete exact-advertiser scans can advance lifecycle", () => {
  assert.equal(canAdvanceLifecycle({ status: "complete", exact_advertiser: true, pagination_complete: true, coverage_complete: true }), true);
  for (const status of ["partial", "suspect", "blocked", "skipped", "failed", "unsupported"] as const) {
    assert.equal(canAdvanceLifecycle({ status, exact_advertiser: true, pagination_complete: true, coverage_complete: true }), false);
  }
  assert.equal(canAdvanceLifecycle({ status: "complete", exact_advertiser: false, pagination_complete: true, coverage_complete: true }), false);
  assert.equal(canAdvanceLifecycle({ status: "complete", exact_advertiser: true, pagination_complete: false, coverage_complete: true }), false);
});

test("public evidence rejects performance claims but permits an explicit negated boundary", () => {
  assert.throws(() => assertPublicEvidenceClaims("This competitor ad is profitable."), /performance claim/i);
  assert.throws(() => assertPublicEvidenceClaims("This is a verified winner with positive ROAS."), /performance claim/i);
  assert.doesNotThrow(() => assertPublicEvidenceClaims(
    "Observed public durability does not prove spend, conversions, CPA, ROAS, revenue, profit, or a verified winner.",
  ));
});

test("root routing keeps source, durable artifacts, and private runtime distinct", () => {
  const routed = validateRootRouting({
    repository_root: "/Users/greg-mac-mini/Developer/negroni",
    artifact_root: "/Users/greg-mac-mini/Documents/tools-negroni",
    runtime_root: "/Users/greg-mac-mini/.local/share/negroni",
  });
  assert.equal(routed.runtime_root, "/Users/greg-mac-mini/.local/share/negroni");
  assert.throws(() => validateRootRouting({
    repository_root: "/Users/greg-mac-mini/Developer/negroni",
    artifact_root: "/Users/greg-mac-mini/Documents/tools-negroni",
    runtime_root: "/Users/greg-mac-mini/Documents/tools-negroni/runtime",
  }), /runtime.*Documents/i);
  assert.throws(() => validateRootRouting({
    repository_root: "/Users/greg-mac-mini/Developer/negroni",
    artifact_root: "/Users/greg-mac-mini/Developer/negroni/generated",
    runtime_root: "/Users/greg-mac-mini/.local/share/negroni",
  }), /artifact.*repository/i);
});
