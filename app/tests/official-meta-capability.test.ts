import assert from "node:assert/strict";
import test from "node:test";
import { evaluateOfficialMetaCapability } from "@/lib/competitor-research/official-meta-capability";

test("ordinary non-EU commercial competitor coverage is unsupported by the official archive endpoint", () => {
  const result = evaluateOfficialMetaCapability({
    graph_version: "v26.0",
    page_ids: ["1234567890"],
    ad_type: "ALL",
    reached_countries: ["US"],
    authorized: true,
    live_coverage_proof_verified: true,
  });
  assert.equal(result.state, "unsupported");
  assert.equal(result.reason_code, "non_eu_commercial_ads_not_returned");
  assert.equal(result.can_collect, false);
});

test("EU commercial eligibility stays blocked until authorization and a bounded live coverage proof both pass", () => {
  const unauthorized = evaluateOfficialMetaCapability({
    graph_version: "v26.0",
    page_ids: ["1234567890"],
    ad_type: "ALL",
    reached_countries: ["DE"],
    authorized: false,
    live_coverage_proof_verified: false,
  });
  assert.equal(unauthorized.state, "blocked");
  assert.equal(unauthorized.reason_code, "authorization_required");

  const unproved = evaluateOfficialMetaCapability({
    ...unauthorized.request,
    authorized: true,
    live_coverage_proof_verified: false,
  });
  assert.equal(unproved.state, "blocked");
  assert.equal(unproved.reason_code, "live_coverage_proof_required");

  const proved = evaluateOfficialMetaCapability({
    ...unauthorized.request,
    authorized: true,
    live_coverage_proof_verified: true,
  });
  assert.equal(proved.state, "supported");
  assert.equal(proved.can_collect, true);
});

test("political and issue ads are globally eligible but still require authorized proof", () => {
  const result = evaluateOfficialMetaCapability({
    graph_version: "v26.0",
    page_ids: ["1234567890"],
    ad_type: "POLITICAL_AND_ISSUE_ADS",
    reached_countries: ["US"],
    authorized: false,
    live_coverage_proof_verified: false,
  });
  assert.equal(result.state, "blocked");
  assert.equal(result.reason_code, "authorization_required");
});

test("preflight is strict, bounded to ten Page IDs, and records field omissions honestly", () => {
  assert.throws(() => evaluateOfficialMetaCapability({
    graph_version: "v26.0",
    page_ids: Array.from({ length: 11 }, (_, index) => String(10000 + index)),
    ad_type: "ALL",
    reached_countries: ["DE"],
    authorized: true,
    live_coverage_proof_verified: true,
  }), /one through ten/);

  const result = evaluateOfficialMetaCapability({
    graph_version: "v26.0",
    page_ids: ["1234567890"],
    ad_type: "ALL",
    reached_countries: ["DE"],
    authorized: true,
    live_coverage_proof_verified: true,
  });
  assert.ok(result.expected_fields.includes("ad_creative_bodies"));
  assert.ok(result.expected_fields.includes("page_id"));
  assert.ok(result.known_omissions.some((item) => item.includes("spend")));
  assert.ok(result.known_omissions.some((item) => item.includes("conversion")));
  assert.equal(result.max_page_ids, 10);
  assert.equal(result.numeric_rate_limit, null);
});
