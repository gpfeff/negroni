import { createHash } from "node:crypto";
import type { NormalizedAd } from "./contracts.ts";
import { stableAdIdentity, stableNamespacedId } from "./ids.ts";
import {
  canonicalEvidenceUrl,
  knownValue,
  unknownValue,
  validateNormalizedAd,
} from "./validation.ts";

const FOREPLAY_ORIGIN = "https://public.api.foreplay.co";
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_ADS = 1_000;
const MAX_PAGES = 4;
const PAGE_SIZE = 250;

export type ForeplayFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type ForeplayAdResponse = {
  id: string;
  ad_id: string;
  name: string;
  brand_id?: string | null;
  description?: string | null;
  headline?: string | null;
  cta_title?: string | null;
  cta_type?: string | null;
  display_format?: string | null;
  link_url?: string | null;
  live?: boolean | null;
  publisher_platform?: string[] | null;
  full_transcription?: string | null;
  type?: string | null;
  video?: string | null;
  image?: string | null;
  foreplay_url?: string | null;
  [key: string]: unknown;
};

type ForeplayEnvelope = {
  metadata?: {
    success?: boolean;
    status_code?: number;
    cursor?: string | number | null;
    count?: number | null;
  };
  data?: ForeplayAdResponse | ForeplayAdResponse[] | null;
  error?: unknown;
};

type ProviderState = "complete" | "complete_zero" | "partial" | "blocked" | "failed";

export type ForeplayCoverageReceipt = {
  provider_index_pagination_complete: boolean;
  meta_platform_coverage_verified: false;
  requested_country: string;
  requested_country_coverage_verified: false;
  exact_advertiser: boolean;
  collect_attempted: boolean;
  request_count: number;
  provider_results_returned: number;
  distinct_ads: number;
  provider_credit_cost_reported: number | null;
  provider_credits_remaining: number | null;
};

export type ForeplayEvidenceLink = {
  public_ad_id: string;
  provider_record_id: string;
  provider_url: string | null;
  meta_ad_library_url: string;
};

export type ForeplayCompetitorEvidence = {
  competitor_id: string;
  advertiser_id: string;
  advertiser_name: string;
  observed_active_at: string;
  meta_page_id: string | null;
  identity_basis: "meta_page_id" | "foreplay_brand_id";
  countable_for_requested_country_gate: false;
  active_ad_ids: string[];
  evidence_urls: string[];
};

export type ForeplayCollectionResult = {
  contract: "negroni-foreplay-collection";
  contract_version: "1.0";
  provider: "foreplay_api";
  mode: "page" | "discovery";
  status: ProviderState;
  ads: NormalizedAd[];
  competitors: ForeplayCompetitorEvidence[];
  evidence_links: ForeplayEvidenceLink[];
  coverage: ForeplayCoverageReceipt;
  limitations: string[];
};

type CommonRequest = {
  project_id: string;
  country_code: string;
  observed_at: string;
  max_ads?: number;
  max_pages?: number;
  signal?: AbortSignal;
};

export type ForeplayPageRequest = CommonRequest & {
  page_id: string;
  advertiser_name: string;
  collect_on_empty?: boolean;
};

export type ForeplayDiscoveryRequest = CommonRequest & {
  query: string;
};

type PageBatch = {
  ads: ForeplayAdResponse[];
  requestCount: number;
  rawResultCount: number;
  paginationComplete: boolean;
  providerCreditCostReported: number | null;
  providerCreditsRemaining: number | null;
  terminalState: "ok" | "blocked" | "failed";
  limitation: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sha256(value: unknown): string {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function nonemptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function validatedTimestamp(value: string): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error("Foreplay collection requires a valid observed_at timestamp.");
  return new Date(milliseconds).toISOString();
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number, label: string): number {
  const candidate = value ?? fallback;
  if (!Number.isInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} through ${maximum}.`);
  }
  return candidate;
}

function validateProjectId(value: string): string {
  if (!/^[a-z][a-z0-9_-]{2,127}$/.test(value)) {
    throw new Error("Foreplay collection requires a stable lowercase project ID.");
  }
  return value;
}

function validatePageId(value: string): string {
  if (!/^\d{5,40}$/.test(value)) throw new Error("Foreplay page collection requires a numeric Meta Page ID.");
  return value;
}

function validateCountryCode(value: string): string {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(normalized)) {
    throw new Error("Foreplay collection requires a two-letter requested country code.");
  }
  return normalized;
}

function metaAdLibraryUrl(adId: string): string {
  return canonicalEvidenceUrl(`https://www.facebook.com/ads/library/?id=${encodeURIComponent(adId)}`);
}

function safeProviderUrl(value: unknown): string | null {
  const candidate = nonemptyString(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.hostname !== "app.foreplay.co") return null;
    return canonicalEvidenceUrl(url.toString());
  } catch {
    return null;
  }
}

function safeLandingPage(value: unknown) {
  const candidate = nonemptyString(value);
  if (!candidate) return unknownValue<string>("Foreplay did not return a landing-page URL for this ad.");
  try {
    return knownValue(canonicalEvidenceUrl(candidate));
  } catch {
    return unknownValue<string>("Foreplay returned a landing-page value that was not a valid HTTPS evidence URL.");
  }
}

function creativeFormat(ad: ForeplayAdResponse) {
  const value = nonemptyString(ad.display_format)
    ?? nonemptyString(ad.type)
    ?? (nonemptyString(ad.video) ? "video" : null)
    ?? (nonemptyString(ad.image) ? "image" : null);
  return value
    ? knownValue(value)
    : unknownValue<string>("Foreplay did not return a verified creative format for this ad.");
}

function copyValue(ad: ForeplayAdResponse) {
  const value = nonemptyString(ad.description) ?? nonemptyString(ad.full_transcription);
  return value
    ? knownValue(value)
    : unknownValue<string>("Foreplay did not return ad copy or a transcription for this ad.");
}

function normalizeAd(input: {
  raw: ForeplayAdResponse;
  projectId: string;
  observedAt: string;
  pageId: string | null;
  requestedAdvertiserName: string | null;
  collectionStatus: ProviderState;
  limitations: string[];
}): NormalizedAd {
  const publicAdId = input.raw.ad_id.trim();
  const providerRecordId = input.raw.id.trim();
  const advertiserName = input.requestedAdvertiserName ?? input.raw.name.trim();
  const advertiserId = input.pageId
    ?? nonemptyString(input.raw.brand_id)
    ?? stableNamespacedId("adv", "foreplay", advertiserName).id;
  const identity = stableAdIdentity({
    platform: "meta",
    provider: "foreplay_api",
    public_ad_id: publicAdId,
    stable_source_locator: providerRecordId,
    content_locator: null,
  });
  const competitorId = stableNamespacedId("cmp", "meta", advertiserId).id;
  const payloadSha = sha256(input.raw);
  const headline = nonemptyString(input.raw.headline);
  const cta = nonemptyString(input.raw.cta_title) ?? nonemptyString(input.raw.cta_type);
  const normalized: NormalizedAd = {
    contract: "negroni-normalized-ad",
    contract_version: "1.0",
    project_id: input.projectId,
    ad_record_id: identity.ad_record_id,
    platform: "meta",
    provider: "foreplay_api",
    public_ad_id: publicAdId,
    identity_basis: identity.identity_basis,
    identity_confidence: identity.identity_confidence,
    identity_reason: identity.low_confidence_reason,
    advertiser_id: advertiserId,
    advertiser_name: advertiserName,
    competitor_id: competitorId,
    source_url: metaAdLibraryUrl(publicAdId),
    first_observed_at: input.observedAt,
    last_observed_at: input.observedAt,
    lifecycle_status: input.raw.live === true ? "active" : input.raw.live === false ? "inactive" : "unknown",
    successful_observations: 1,
    missed_eligible_observations: 0,
    days_observed_active: input.raw.live === true ? 1 : 0,
    observed_span_days: 1,
    copy: copyValue(input.raw),
    headline: headline
      ? knownValue(headline)
      : unknownValue<string>("Foreplay did not return a separate headline for this ad."),
    cta: cta
      ? knownValue(cta)
      : unknownValue<string>("Foreplay did not return a verified CTA for this ad."),
    landing_page_url: safeLandingPage(input.raw.link_url),
    creative_format: creativeFormat(input.raw),
    content_version_id: stableNamespacedId("cv", input.projectId, publicAdId, payloadSha).id,
    creative_family_id: null,
    collection_status: input.collectionStatus,
    evidence_confidence: input.pageId ? "medium" : "low",
    limitations: input.limitations,
    source_payload_sha256: payloadSha,
  };
  return validateNormalizedAd(normalized);
}

function parseEnvelope(value: unknown): { ads: ForeplayAdResponse[]; cursor: string | null } | null {
  if (!isRecord(value)) return null;
  const envelope = value as ForeplayEnvelope;
  if (envelope.metadata?.success === false) return null;
  const rawData = envelope.data === null || envelope.data === undefined
    ? []
    : Array.isArray(envelope.data)
      ? envelope.data
      : [envelope.data];
  const ads: ForeplayAdResponse[] = [];
  for (const candidate of rawData) {
    if (!isRecord(candidate)
      || !nonemptyString(candidate.id)
      || !nonemptyString(candidate.ad_id)
      || !nonemptyString(candidate.name)) return null;
    ads.push(candidate as ForeplayAdResponse);
  }
  const rawCursor = envelope.metadata?.cursor;
  const cursor = rawCursor === null || rawCursor === undefined || rawCursor === ""
    ? null
    : String(rawCursor);
  return { ads, cursor };
}

function blockedLimitation(status: number): string {
  if (status === 401 || status === 403) {
    return "Foreplay authorization is unavailable; connect an authorized server-side API credential before retrying.";
  }
  if (status === 402) {
    return "Foreplay reported insufficient API credits; no competitor coverage was claimed.";
  }
  return "Foreplay rate-limited the bounded read-only request; no competitor coverage was claimed.";
}

function nonnegativeHeader(response: Response, name: string): number | null {
  const raw = response.headers.get(name);
  if (raw === null || !/^\d+$/.test(raw.trim())) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

function competitorsFromAds(
  ads: NormalizedAd[],
  observedAt: string,
  pageId: string | null,
): ForeplayCompetitorEvidence[] {
  const grouped = new Map<string, ForeplayCompetitorEvidence>();
  for (const ad of ads) {
    if (ad.lifecycle_status !== "active" || !ad.public_ad_id) continue;
    const existing = grouped.get(ad.competitor_id) ?? {
      competitor_id: ad.competitor_id,
      advertiser_id: ad.advertiser_id,
      advertiser_name: ad.advertiser_name,
      observed_active_at: observedAt,
      meta_page_id: pageId,
      identity_basis: pageId ? "meta_page_id" : "foreplay_brand_id",
      countable_for_requested_country_gate: false,
      active_ad_ids: [],
      evidence_urls: [],
    };
    if (!existing.active_ad_ids.includes(ad.public_ad_id)) existing.active_ad_ids.push(ad.public_ad_id);
    if (!existing.evidence_urls.includes(ad.source_url)) existing.evidence_urls.push(ad.source_url);
    grouped.set(ad.competitor_id, existing);
  }
  return [...grouped.values()]
    .map((item) => ({
      ...item,
      active_ad_ids: [...item.active_ad_ids].sort(),
      evidence_urls: [...item.evidence_urls].sort(),
    }))
    .sort((left, right) => left.advertiser_name.localeCompare(right.advertiser_name));
}

export class ForeplayAdsProvider {
  private readonly apiKey: string;
  private readonly fetchImpl: ForeplayFetch;
  private readonly requestTimeoutMs: number;

  constructor(options: {
    apiKey: string;
    fetchImpl?: ForeplayFetch;
    requestTimeoutMs?: number;
  }) {
    if (typeof options.apiKey !== "string" || options.apiKey.trim().length < 8) {
      throw new Error("Foreplay requires a server-side API credential.");
    }
    this.apiKey = options.apiKey.trim();
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.requestTimeoutMs = boundedInteger(options.requestTimeoutMs, 45_000, 1_000, 60_000, "requestTimeoutMs");
  }

  private async fetchPage(url: URL, signal?: AbortSignal): Promise<{
    state: "ok" | "blocked" | "failed";
    parsed: { ads: ForeplayAdResponse[]; cursor: string | null } | null;
    limitation: string | null;
    providerCreditCostReported: number | null;
    providerCreditsRemaining: number | null;
  }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        redirect: "error",
        signal: controller.signal,
      });
      const providerCreditCostReported = nonnegativeHeader(response, "x-credit-cost");
      const providerCreditsRemaining = nonnegativeHeader(response, "x-credits-remaining");
      if ([401, 402, 403, 429].includes(response.status)) {
        return {
          state: "blocked",
          parsed: null,
          limitation: blockedLimitation(response.status),
          providerCreditCostReported,
          providerCreditsRemaining,
        };
      }
      if (response.status === 404) {
        return {
          state: "ok",
          parsed: { ads: [], cursor: null },
          limitation: null,
          providerCreditCostReported,
          providerCreditsRemaining,
        };
      }
      if (!response.ok) {
        return {
          state: "failed",
          parsed: null,
          limitation: `Foreplay returned HTTP ${response.status}; the response body was not retained and no coverage was claimed.`,
          providerCreditCostReported,
          providerCreditsRemaining,
        };
      }
      const declaredLength = Number(response.headers.get("content-length") ?? "0");
      if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
        return {
          state: "failed",
          parsed: null,
          limitation: "Foreplay returned an oversized response; no response body or coverage was retained.",
          providerCreditCostReported,
          providerCreditsRemaining,
        };
      }
      const body = await response.text();
      if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
        return {
          state: "failed",
          parsed: null,
          limitation: "Foreplay returned an oversized response; no response body or coverage was retained.",
          providerCreditCostReported,
          providerCreditsRemaining,
        };
      }
      let value: unknown;
      try {
        value = JSON.parse(body);
      } catch {
        return {
          state: "failed",
          parsed: null,
          limitation: "Foreplay returned invalid JSON; no response body or coverage was retained.",
          providerCreditCostReported,
          providerCreditsRemaining,
        };
      }
      const parsed = parseEnvelope(value);
      return parsed
        ? {
            state: "ok",
            parsed,
            limitation: null,
            providerCreditCostReported,
            providerCreditsRemaining,
          }
        : {
            state: "failed",
            parsed: null,
            limitation: "Foreplay returned an invalid ad envelope; no unverified records were accepted.",
            providerCreditCostReported,
            providerCreditsRemaining,
          };
    } catch {
      return {
        state: "failed",
        parsed: null,
        limitation: signal?.aborted
          ? "The Foreplay request was cancelled before coverage could be established."
          : "The bounded Foreplay request failed or timed out; no response detail or coverage was retained.",
        providerCreditCostReported: null,
        providerCreditsRemaining: null,
      };
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  private async paginatedRequest(input: {
    path: string;
    parameters: URLSearchParams;
    maxAds: number;
    maxPages: number;
    signal?: AbortSignal;
  }): Promise<PageBatch> {
    const ads = new Map<string, ForeplayAdResponse>();
    let requestCount = 0;
    let rawResultCount = 0;
    let cursor: string | null = null;
    let paginationComplete = false;
    let reportedCreditCost = 0;
    let creditCostHeadersComplete = true;
    let providerCreditsRemaining: number | null = null;
    const seenCursors = new Set<string>();
    for (let page = 0; page < input.maxPages && ads.size < input.maxAds; page += 1) {
      const url = new URL(input.path, FOREPLAY_ORIGIN);
      for (const [key, value] of input.parameters.entries()) url.searchParams.append(key, value);
      url.searchParams.set("limit", String(Math.min(PAGE_SIZE, input.maxAds - ads.size)));
      if (cursor) url.searchParams.set("cursor", cursor);
      requestCount += 1;
      const response = await this.fetchPage(url, input.signal);
      if (response.providerCreditCostReported === null) creditCostHeadersComplete = false;
      else reportedCreditCost += response.providerCreditCostReported;
      if (response.providerCreditsRemaining !== null) {
        providerCreditsRemaining = response.providerCreditsRemaining;
      }
      if (response.state !== "ok" || !response.parsed) {
        return {
          ads: [...ads.values()],
          requestCount,
          rawResultCount,
          paginationComplete: false,
          providerCreditCostReported: creditCostHeadersComplete ? reportedCreditCost : null,
          providerCreditsRemaining,
          terminalState: response.state,
          limitation: response.limitation,
        };
      }
      rawResultCount += response.parsed.ads.length;
      for (const item of response.parsed.ads) {
        if (!ads.has(item.ad_id)) ads.set(item.ad_id, item);
      }
      cursor = response.parsed.cursor;
      if (!cursor) {
        paginationComplete = true;
        break;
      }
      if (seenCursors.has(cursor)) {
        return {
          ads: [...ads.values()],
          requestCount,
          rawResultCount,
          paginationComplete: false,
          providerCreditCostReported: creditCostHeadersComplete ? reportedCreditCost : null,
          providerCreditsRemaining,
          terminalState: "failed",
          limitation: "Foreplay repeated a pagination cursor; collection stopped without claiming complete coverage.",
        };
      }
      seenCursors.add(cursor);
    }
    return {
      ads: [...ads.values()],
      requestCount,
      rawResultCount,
      paginationComplete,
      providerCreditCostReported: creditCostHeadersComplete ? reportedCreditCost : null,
      providerCreditsRemaining,
      terminalState: "ok",
      limitation: paginationComplete ? null : "Foreplay pagination remained open at the configured request bound; the result is partial.",
    };
  }

  private result(input: {
    mode: "page" | "discovery";
    projectId: string;
    observedAt: string;
    pageId: string | null;
    advertiserName: string | null;
    countryCode: string;
    batch: PageBatch;
    collectAttempted: boolean;
  }): ForeplayCollectionResult {
    const sharedLimitations = [
      "A complete Foreplay response covers the returned provider index page(s); it does not prove complete Meta platform coverage.",
      `The documented Foreplay API does not expose a country filter on these ad endpoints; delivery in requested country ${input.countryCode} remains unverified.`,
    ];
    if (input.collectAttempted) {
      sharedLimitations.push("Foreplay best-effort live collection may time out or return only a partial set of Meta ads.");
    }
    if (input.batch.limitation) sharedLimitations.push(input.batch.limitation);
    let status: ProviderState;
    if (input.batch.terminalState === "blocked") status = "blocked";
    else if (input.batch.terminalState === "failed" && input.batch.ads.length === 0) status = "failed";
    else if (input.collectAttempted || !input.batch.paginationComplete || input.batch.terminalState !== "ok") status = "partial";
    else if (input.batch.ads.length === 0) status = "complete_zero";
    else status = "complete";
    const normalized = input.batch.ads.map((raw) => normalizeAd({
      raw,
      projectId: input.projectId,
      observedAt: input.observedAt,
      pageId: input.pageId,
      requestedAdvertiserName: input.advertiserName,
      collectionStatus: status,
      limitations: sharedLimitations,
    }));
    const evidenceLinks = input.batch.ads.map((raw) => ({
      public_ad_id: raw.ad_id,
      provider_record_id: raw.id,
      provider_url: safeProviderUrl(raw.foreplay_url),
      meta_ad_library_url: metaAdLibraryUrl(raw.ad_id),
    }));
    return {
      contract: "negroni-foreplay-collection",
      contract_version: "1.0",
      provider: "foreplay_api",
      mode: input.mode,
      status,
      ads: normalized,
      competitors: competitorsFromAds(normalized, input.observedAt, input.pageId),
      evidence_links: evidenceLinks,
      coverage: {
        provider_index_pagination_complete: input.batch.paginationComplete,
        meta_platform_coverage_verified: false,
        requested_country: input.countryCode,
        requested_country_coverage_verified: false,
        exact_advertiser: input.mode === "page",
        collect_attempted: input.collectAttempted,
        request_count: input.batch.requestCount,
        provider_results_returned: input.batch.rawResultCount,
        distinct_ads: normalized.length,
        provider_credit_cost_reported: input.batch.providerCreditCostReported,
        provider_credits_remaining: input.batch.providerCreditsRemaining,
      },
      limitations: sharedLimitations,
    };
  }

  async collectPageAds(request: ForeplayPageRequest): Promise<ForeplayCollectionResult> {
    const projectId = validateProjectId(request.project_id);
    const countryCode = validateCountryCode(request.country_code);
    const pageId = validatePageId(request.page_id);
    const advertiserName = nonemptyString(request.advertiser_name);
    if (!advertiserName) throw new Error("Foreplay page collection requires an advertiser name.");
    const observedAt = validatedTimestamp(request.observed_at);
    const maxAds = boundedInteger(request.max_ads, 100, 1, MAX_ADS, "max_ads");
    const maxPages = boundedInteger(request.max_pages, 1, 1, MAX_PAGES, "max_pages");
    const parameters = new URLSearchParams({ page_id: pageId, live: "true", order: "newest" });
    let batch = await this.paginatedRequest({
      path: "/api/brand/getAdsByPageId",
      parameters,
      maxAds,
      maxPages,
      signal: request.signal,
    });
    let collectAttempted = false;
    if (batch.terminalState === "ok" && batch.ads.length === 0 && request.collect_on_empty === true) {
      collectAttempted = true;
      const cachedBatch = batch;
      const collectParameters = new URLSearchParams(parameters);
      collectParameters.set("collect", "true");
      batch = await this.paginatedRequest({
        path: "/api/brand/getAdsByPageId",
        parameters: collectParameters,
        maxAds,
        maxPages,
        signal: request.signal,
      });
      batch.requestCount += cachedBatch.requestCount;
      batch.rawResultCount += cachedBatch.rawResultCount;
      batch.providerCreditCostReported = batch.providerCreditCostReported !== null
        && cachedBatch.providerCreditCostReported !== null
        ? batch.providerCreditCostReported + cachedBatch.providerCreditCostReported
        : null;
      batch.providerCreditsRemaining ??= cachedBatch.providerCreditsRemaining;
    }
    return this.result({
      mode: "page",
      projectId,
      observedAt,
      pageId,
      advertiserName,
      countryCode,
      batch,
      collectAttempted,
    });
  }

  async discoverActiveAds(request: ForeplayDiscoveryRequest): Promise<ForeplayCollectionResult> {
    const projectId = validateProjectId(request.project_id);
    const countryCode = validateCountryCode(request.country_code);
    const query = nonemptyString(request.query);
    if (!query || query.length > 200) throw new Error("Foreplay discovery requires a query of 1 through 200 characters.");
    const observedAt = validatedTimestamp(request.observed_at);
    const maxAds = boundedInteger(request.max_ads, 100, 1, MAX_ADS, "max_ads");
    const maxPages = boundedInteger(request.max_pages, 1, 1, MAX_PAGES, "max_pages");
    const batch = await this.paginatedRequest({
      path: "/api/discovery/ads",
      parameters: new URLSearchParams({
        query,
        live: "true",
        order: "most_relevant",
      }),
      maxAds,
      maxPages,
      signal: request.signal,
    });
    return this.result({
      mode: "discovery",
      projectId,
      observedAt,
      pageId: null,
      advertiserName: null,
      countryCode,
      batch,
      collectAttempted: false,
    });
  }
}
