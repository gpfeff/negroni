import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  buildVisibleCapture,
  validateVisibleCapture,
} = require("../meta-ad-capture-extension/capture-core.js");

const sourceUrl =
  "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&q=workers%20comp&session=private#fragment";

function fixtureCard(overrides = {}) {
  return {
    visible_text: [
      "Active",
      "Library ID: 123456789012345",
      "Started running on Jul 20, 2026",
      "Fixture Injury Law",
      "Sponsored",
      "Hurt at work? Learn what options may be available.",
      "Learn More",
    ].join("\n"),
    links: [
      {
        href: "https://www.facebook.com/people/Fixture-Injury-Law/998877665544332/",
        text: "Fixture Injury Law",
      },
      {
        href: "https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.test%2Fworkers-comp%3Futm_source%3Dmeta%26access_token%3Dremove-me",
        text: "Learn More",
      },
    ],
    ...overrides,
  };
}

test("buildVisibleCapture emits a partial engine-compatible payload without media credentials", () => {
  const payload = buildVisibleCapture(
    [fixtureCard(), fixtureCard()],
    {
      sourceUrl,
      collectedAt: "2026-07-30T20:00:00.000Z",
    },
  );

  assert.equal(payload.contract, "negroni-meta-visible-capture");
  assert.equal(payload.contract_version, "1.0");
  assert.equal(payload.schema_version, 2);
  assert.equal(payload.collection_status, "partial");
  assert.equal(payload.pagination_complete, false);
  assert.equal(payload.coverage_complete, false);
  assert.equal(payload.requested_country, "US");
  assert.equal(payload.ads.length, 1, "duplicate rendered copies must collapse by Library ID");
  assert.deepEqual(payload.ads[0], {
    library_id: "123456789012345",
    status: "active",
    started_at: "Jul 20, 2026",
    page_id: "998877665544332",
    page_name: "Fixture Injury Law",
    page_url: "https://www.facebook.com/people/Fixture-Injury-Law/998877665544332/",
    ad_text: "Hurt at work? Learn what options may be available.\nLearn More",
    landing_url: "https://example.test/workers-comp?utm_source=meta",
    ad_library_url: "https://www.facebook.com/ads/library/?id=123456789012345",
    media: [],
  });
  assert.equal(payload.capture_summary.active_ad_count, 1);
  assert.equal(payload.capture_summary.distinct_active_advertiser_count, 1);
  assert.doesNotMatch(JSON.stringify(payload), /remove-me|session=private|access_token/i);
  assert.deepEqual(validateVisibleCapture(payload), {
    ad_count: 1,
    active_ad_count: 1,
    distinct_active_advertiser_count: 1,
    requested_country: "US",
  });
});

test("buildVisibleCapture keeps inactive evidence but does not count it as active", () => {
  const payload = buildVisibleCapture(
    [
      fixtureCard({
        visible_text: "Inactive\nLibrary ID: 444455556666777\nFixture Injury Law",
      }),
    ],
    { sourceUrl, collectedAt: "2026-07-30T20:00:00.000Z" },
  );

  assert.equal(payload.ads[0].status, "inactive");
  assert.equal(payload.capture_summary.active_ad_count, 0);
  assert.equal(payload.capture_summary.distinct_active_advertiser_count, 0);
});

test("validateVisibleCapture rejects false completeness and exported media URLs", () => {
  const payload = buildVisibleCapture(
    [fixtureCard()],
    { sourceUrl, collectedAt: "2026-07-30T20:00:00.000Z" },
  );

  assert.throws(
    () => validateVisibleCapture({ ...payload, pagination_complete: true }),
    /must not claim complete pagination/i,
  );
  assert.throws(
    () =>
      validateVisibleCapture({
        ...payload,
        ads: [{ ...payload.ads[0], media: [{ type: "image", url: "https://scontent.test/x" }] }],
      }),
    /must not export media URLs/i,
  );
});

test("buildVisibleCapture accepts only the public Meta Ad Library surface", () => {
  assert.throws(
    () =>
      buildVisibleCapture([fixtureCard()], {
        sourceUrl: "https://example.test/not-meta",
        collectedAt: "2026-07-30T20:00:00.000Z",
      }),
    /Meta Ad Library URL/i,
  );
});
