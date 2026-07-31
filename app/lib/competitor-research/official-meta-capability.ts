export type OfficialMetaCapabilityRequest = {
  graph_version: "v26.0";
  page_ids: string[];
  ad_type:
    | "ALL"
    | "EMPLOYMENT_ADS"
    | "FINANCIAL_PRODUCTS_AND_SERVICES_ADS"
    | "HOUSING_ADS"
    | "POLITICAL_AND_ISSUE_ADS";
  reached_countries: string[];
  authorized: boolean;
  live_coverage_proof_verified: boolean;
};

export type OfficialMetaCapabilityResult = {
  contract: "negroni-official-meta-capability";
  contract_version: "1.0";
  evaluated_against: "Meta Graph API v26.0 Ads Archive";
  request: OfficialMetaCapabilityRequest;
  state: "supported" | "blocked" | "unsupported";
  reason_code:
    | "coverage_and_authorization_verified"
    | "authorization_required"
    | "live_coverage_proof_required"
    | "non_eu_commercial_ads_not_returned";
  can_collect: boolean;
  coverage_scope: "political_and_issue_global" | "eu_reached_ads_only" | "none";
  max_page_ids: 10;
  expected_fields: string[];
  known_omissions: string[];
  numeric_rate_limit: null;
  rate_limit_receipt: "Meta documents error 613 for exceeded API limits; no numeric quota is stated on the v26 endpoint reference.";
  external_actions: [];
};

const EU_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE",
  "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT",
  "RO", "SK", "SI", "ES", "SE",
]);

const AD_TYPES = new Set([
  "ALL",
  "EMPLOYMENT_ADS",
  "FINANCIAL_PRODUCTS_AND_SERVICES_ADS",
  "HOUSING_ADS",
  "POLITICAL_AND_ISSUE_ADS",
]);

const EXPECTED_FIELDS = [
  "id",
  "ad_creation_time",
  "ad_creative_bodies",
  "ad_creative_link_captions",
  "ad_creative_link_descriptions",
  "ad_creative_link_titles",
  "ad_delivery_start_time",
  "ad_delivery_stop_time",
  "ad_snapshot_url",
  "page_id",
  "page_name",
  "publisher_platforms",
];

const KNOWN_OMISSIONS = [
  "Impression and spend ranges are documented only for POLITICAL_AND_ISSUE_ADS, not ordinary commercial ads.",
  "The endpoint does not provide conversions, leads, CPA, ROAS, revenue, profitability, or verified performance.",
  "Commercial ads that reached no EU location are not returned; non-EU coverage is limited to political and issue ads.",
  "Media binaries are not copied by this capability contract; ad_snapshot_url remains source evidence only.",
];

function exactRequest(value: OfficialMetaCapabilityRequest): OfficialMetaCapabilityRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Official Meta capability input must be an object.");
  }
  const keys = [
    "ad_type",
    "authorized",
    "graph_version",
    "live_coverage_proof_verified",
    "page_ids",
    "reached_countries",
  ];
  if (Object.keys(value).sort().join(",") !== keys.sort().join(",")) {
    throw new Error("Official Meta capability input contains unsupported fields.");
  }
  if (value.graph_version !== "v26.0") throw new Error("Only the currently reviewed Meta Graph API v26.0 contract is supported.");
  if (!AD_TYPES.has(value.ad_type)) throw new Error("The requested Meta ad type is unsupported.");
  if (!Array.isArray(value.page_ids) || value.page_ids.length < 1 || value.page_ids.length > 10) {
    throw new Error("Official Meta preflight requires one through ten Page IDs.");
  }
  if (new Set(value.page_ids).size !== value.page_ids.length
    || value.page_ids.some((id) => typeof id !== "string" || !/^\d{5,40}$/.test(id))) {
    throw new Error("Official Meta preflight requires unique numeric Page IDs.");
  }
  if (!Array.isArray(value.reached_countries)
    || value.reached_countries.length < 1
    || new Set(value.reached_countries).size !== value.reached_countries.length
    || value.reached_countries.some((country) => typeof country !== "string" || !/^(?:ALL|[A-Z]{2})$/.test(country))) {
    throw new Error("Official Meta preflight requires unique ISO reached-country codes.");
  }
  if (typeof value.authorized !== "boolean" || typeof value.live_coverage_proof_verified !== "boolean") {
    throw new Error("Official Meta authorization and coverage proof flags must be boolean.");
  }
  return structuredClone(value);
}

export function evaluateOfficialMetaCapability(
  unknownRequest: OfficialMetaCapabilityRequest,
): OfficialMetaCapabilityResult {
  const request = exactRequest(unknownRequest);
  const political = request.ad_type === "POLITICAL_AND_ISSUE_ADS";
  const reachesEu = request.reached_countries.includes("ALL")
    || request.reached_countries.some((country) => EU_COUNTRIES.has(country));
  const base = {
    contract: "negroni-official-meta-capability" as const,
    contract_version: "1.0" as const,
    evaluated_against: "Meta Graph API v26.0 Ads Archive" as const,
    request,
    max_page_ids: 10 as const,
    expected_fields: [...EXPECTED_FIELDS],
    known_omissions: [...KNOWN_OMISSIONS],
    numeric_rate_limit: null,
    rate_limit_receipt: "Meta documents error 613 for exceeded API limits; no numeric quota is stated on the v26 endpoint reference." as const,
    external_actions: [] as [],
  };

  if (!political && !reachesEu) {
    return {
      ...base,
      state: "unsupported",
      reason_code: "non_eu_commercial_ads_not_returned",
      can_collect: false,
      coverage_scope: "none",
    };
  }
  const coverageScope = political ? "political_and_issue_global" as const : "eu_reached_ads_only" as const;
  if (!request.authorized) {
    return {
      ...base,
      state: "blocked",
      reason_code: "authorization_required",
      can_collect: false,
      coverage_scope: coverageScope,
    };
  }
  if (!request.live_coverage_proof_verified) {
    return {
      ...base,
      state: "blocked",
      reason_code: "live_coverage_proof_required",
      can_collect: false,
      coverage_scope: coverageScope,
    };
  }
  return {
    ...base,
    state: "supported",
    reason_code: "coverage_and_authorization_verified",
    can_collect: true,
    coverage_scope: coverageScope,
  };
}
