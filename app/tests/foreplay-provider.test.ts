import assert from "node:assert/strict";
import test from "node:test";
import {
  ForeplayAdsProvider,
  type ForeplayFetch,
} from "@/lib/competitor-research/foreplay-provider";

function jsonResponse(value: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...Object.fromEntries(new Headers(headers)) },
  });
}

function ad(overrides: Record<string, unknown> = {}) {
  return {
    id: "foreplay-record-1",
    ad_id: "100000000000001",
    name: "Example Workers Compensation Law",
    brand_id: "brand-1",
    description: "Injured at work? Learn which next steps may be available.",
    headline: "Talk with a workers' compensation lawyer",
    cta_type: "LEARN_MORE",
    display_format: "video",
    link_url: "https://example.com/work-injury?utm_source=meta",
    live: true,
    publisher_platform: ["facebook", "instagram"],
    started_running: 1784678400000,
    video: "https://cdn.example.com/ad.mp4",
    foreplay_url: "https://app.foreplay.co/discovery?ad=foreplay-record-1",
    ...overrides,
  };
}

test("Foreplay page collection normalizes cached active ads and records unverified Meta coverage", async () => {
  const calls: Array<{ url: URL; authorization: string | null }> = [];
  const fetchImpl: ForeplayFetch = async (input, init) => {
    calls.push({
      url: new URL(String(input)),
      authorization: new Headers(init?.headers).get("authorization"),
    });
    return jsonResponse({
      metadata: { success: true, status_code: 200, cursor: null, count: 1 },
      data: [ad()],
      error: null,
    }, 200, { "x-credit-cost": "1", "x-credits-remaining": "9999" });
  };
  const provider = new ForeplayAdsProvider({
    apiKey: "fixture-foreplay-key-never-persisted",
    fetchImpl,
  });

  const result = await provider.collectPageAds({
    project_id: "workers-comp-lawyers",
    country_code: "US",
    page_id: "123456789012345",
    advertiser_name: "Example Workers Compensation Law",
    observed_at: "2026-07-30T20:00:00.000Z",
    max_ads: 50,
    collect_on_empty: true,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.origin, "https://public.api.foreplay.co");
  assert.equal(calls[0].url.pathname, "/api/brand/getAdsByPageId");
  assert.equal(calls[0].url.searchParams.get("page_id"), "123456789012345");
  assert.equal(calls[0].url.searchParams.get("live"), "true");
  assert.equal(calls[0].url.searchParams.get("limit"), "50");
  assert.equal(calls[0].url.searchParams.has("collect"), false);
  assert.equal(calls[0].authorization, "Bearer fixture-foreplay-key-never-persisted");
  assert.equal(result.status, "complete");
  assert.equal(result.coverage.provider_index_pagination_complete, true);
  assert.equal(result.coverage.meta_platform_coverage_verified, false);
  assert.equal(result.coverage.requested_country, "US");
  assert.equal(result.coverage.requested_country_coverage_verified, false);
  assert.equal(result.coverage.collect_attempted, false);
  assert.equal(result.coverage.provider_credit_cost_reported, 1);
  assert.equal(result.coverage.provider_credits_remaining, 9999);
  assert.equal(result.ads.length, 1);
  assert.equal(result.ads[0].provider, "foreplay_api");
  assert.equal(result.ads[0].public_ad_id, "100000000000001");
  assert.equal(result.ads[0].advertiser_id, "123456789012345");
  assert.equal(result.ads[0].lifecycle_status, "active");
  assert.equal(result.ads[0].landing_page_url.value, "https://example.com/work-injury");
  assert.equal(result.ads[0].source_url, "https://www.facebook.com/ads/library/?id=100000000000001");
  assert.match(result.limitations.join(" "), /does not prove complete Meta platform coverage/i);
  assert.doesNotMatch(JSON.stringify(result), /fixture-foreplay-key-never-persisted/);
});

test("Foreplay collection uses the documented collect fallback only after an empty cached result", async () => {
  const calls: URL[] = [];
  const fetchImpl: ForeplayFetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (!url.searchParams.has("collect")) {
      return jsonResponse({
        metadata: { success: true, status_code: 200, cursor: null, count: 0 },
        data: [],
        error: null,
      });
    }
    return jsonResponse({
      metadata: { success: true, status_code: 200, cursor: null, count: 1 },
      data: [ad()],
      error: null,
    });
  };
  const provider = new ForeplayAdsProvider({ apiKey: "fixture-key", fetchImpl });

  const result = await provider.collectPageAds({
    project_id: "workers-comp-lawyers",
    country_code: "US",
    page_id: "123456789012345",
    advertiser_name: "Example Workers Compensation Law",
    observed_at: "2026-07-30T20:00:00.000Z",
    max_ads: 25,
    collect_on_empty: true,
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].searchParams.has("collect"), false);
  assert.equal(calls[1].searchParams.get("collect"), "true");
  assert.equal(result.status, "partial");
  assert.equal(result.coverage.collect_attempted, true);
  assert.equal(result.ads.length, 1);
  assert.match(result.limitations.join(" "), /best-effort live collection/i);
});

test("Foreplay authorization and credit failures are blocked without leaking response or credential material", async () => {
  for (const status of [401, 402, 403, 429]) {
    const fetchImpl: ForeplayFetch = async () => jsonResponse({
      error: { message: "fixture-foreplay-key secret provider detail" },
    }, status);
    const provider = new ForeplayAdsProvider({ apiKey: "fixture-foreplay-key", fetchImpl });
    const result = await provider.collectPageAds({
      project_id: "workers-comp-lawyers",
      country_code: "US",
      page_id: "123456789012345",
      advertiser_name: "Example Workers Compensation Law",
      observed_at: "2026-07-30T20:00:00.000Z",
      max_ads: 10,
      collect_on_empty: false,
    });

    assert.equal(result.status, "blocked");
    assert.deepEqual(result.ads, []);
    assert.doesNotMatch(JSON.stringify(result), /fixture-foreplay-key|secret provider detail/i);
  }
});

test("Foreplay discovery returns distinct active-advertiser candidates without falsely satisfying the country gate", async () => {
  const calls: URL[] = [];
  const fetchImpl: ForeplayFetch = async (input) => {
    calls.push(new URL(String(input)));
    return jsonResponse({
      metadata: { success: true, status_code: 200, cursor: null, count: 3 },
      data: [
        ad(),
        ad({ id: "foreplay-record-2", ad_id: "100000000000002" }),
        ad({
          id: "foreplay-record-3",
          ad_id: "100000000000003",
          name: "Second Workplace Injury Law Firm",
          brand_id: "brand-2",
          foreplay_url: "https://app.foreplay.co/discovery?ad=foreplay-record-3",
        }),
      ],
      error: null,
    });
  };
  const provider = new ForeplayAdsProvider({ apiKey: "fixture-key", fetchImpl });

  const result = await provider.discoverActiveAds({
    project_id: "workers-comp-lawyers",
    country_code: "US",
    query: "workers compensation lawyer",
    observed_at: "2026-07-30T20:00:00.000Z",
    max_ads: 100,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].pathname, "/api/discovery/ads");
  assert.equal(calls[0].searchParams.get("query"), "workers compensation lawyer");
  assert.equal(calls[0].searchParams.get("live"), "true");
  assert.equal(calls[0].searchParams.get("order"), "most_relevant");
  assert.equal(result.ads.length, 3);
  assert.equal(result.competitors.length, 2);
  assert.deepEqual(result.competitors.map((item) => item.active_ad_ids.length).sort(), [1, 2]);
  assert.equal(result.competitors.every((item) => item.countable_for_requested_country_gate === false), true);
  assert.equal(result.competitors.every((item) => item.meta_page_id === null), true);
  assert.equal(result.competitors.every((item) => item.evidence_urls.every((url) => url.startsWith("https://www.facebook.com/ads/library/"))), true);
  assert.equal(result.coverage.exact_advertiser, false);
  assert.equal(result.coverage.meta_platform_coverage_verified, false);
  assert.equal(result.coverage.requested_country, "US");
  assert.equal(result.coverage.requested_country_coverage_verified, false);
  assert.match(result.limitations.join(" "), /does not expose a country filter/i);
});
