import type {
  CompetitorAdsIntelligence,
  MetaAdsProjectSnapshot,
  ProviderNeutralCollectionReceipt,
} from "./contracts";
import { PROVIDER_NAMES } from "../competitor-research/contracts";
import { validateProfileId } from "./profile-id";

const REFRESH_STATES = new Set([
  "complete",
  "complete_zero",
  "partial",
  "suspect",
  "blocked",
  "skipped",
  "failed",
  "never_run",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isTimestampOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && Number.isFinite(Date.parse(value)));
}

function secureUrl(value: string | null): string | null {
  if (value === null) return null;
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Competitor-ad artifact links must use HTTPS.");
  return url.toString();
}

function assertSnapshotProfile(expected: string, actual: string): void {
  if (validateProfileId(actual) !== validateProfileId(expected)) {
    throw new Error("Meta Ads Intelligence returned data from a different project profile.");
  }
}

export function validateProviderNeutralCollectionReceipt(value: unknown): ProviderNeutralCollectionReceipt {
  if (!isRecord(value)
    || value.contract !== "negroni-competitor-collection-receipt"
    || value.contract_version !== "1.0"
    || typeof value.project_id !== "string"
    || !value.project_id.trim()
    || typeof value.run_id !== "string"
    || !value.run_id.trim()
    || !PROVIDER_NAMES.includes(value.provider as never)
    || !["complete", "complete_zero", "partial", "suspect", "blocked", "skipped", "failed"].includes(value.status as string)
    || (value.resume_run_id !== null && (typeof value.resume_run_id !== "string" || !value.resume_run_id.trim()))
    || !["not_requested", "published", "blocked"].includes(value.google_action as string)
    || value.scheduler_action !== "none"
    || !Array.isArray(value.external_actions)
    || value.external_actions.some((action) => action !== "google_publish")
    || !Array.isArray(value.limitations)
    || value.limitations.some((limitation) => typeof limitation !== "string" || !limitation.trim())) {
    throw new Error("The provider-neutral competitor collection receipt is invalid.");
  }
  if (value.status === "partial" && value.resume_run_id === null) {
    throw new Error("Partial competitor collection receipts require a durable resume run ID.");
  }
  if (value.google_action === "published" && !(value.external_actions as unknown[]).includes("google_publish")) {
    throw new Error("Published Google collection receipts must record the approved external action.");
  }
  if (value.google_action !== "published" && (value.external_actions as unknown[]).length) {
    throw new Error("Blocked or unrequested Google publication cannot claim an external action.");
  }
  return value as unknown as ProviderNeutralCollectionReceipt;
}

export function parseMetaAdsSnapshot(value: unknown, expectedProfile: string): MetaAdsProjectSnapshot {
  if (!isRecord(value)
    || value.contract !== "meta-ads-intelligence-project-snapshot"
    || value.contract_version !== "1.0"
    || typeof value.profile !== "string"
    || typeof value.generated_at !== "string"
    || !Number.isFinite(Date.parse(value.generated_at))) {
    throw new Error("Meta Ads Intelligence returned an invalid project snapshot.");
  }
  assertSnapshotProfile(expectedProfile, value.profile);
  const snapshot = value as unknown as MetaAdsProjectSnapshot;
  if (!isRecord(snapshot.refresh)
    || !REFRESH_STATES.has(snapshot.refresh.status)
    || !isTimestampOrNull(snapshot.refresh.started_at)
    || !isTimestampOrNull(snapshot.refresh.completed_at)
    || !isTimestampOrNull(snapshot.refresh.last_successful_refresh_at)) {
    throw new Error("Meta Ads Intelligence returned an invalid refresh receipt.");
  }
  if (!isRecord(snapshot.totals)
    || !isCount(snapshot.totals.watched_competitors)
    || !isCount(snapshot.totals.active_ads)
    || !isCount(snapshot.totals.creative_families)
    || !isRecord(snapshot.delta)
    || !isCount(snapshot.delta.new_ads)
    || !isCount(snapshot.delta.changed_ads)
    || !isCount(snapshot.delta.newly_observed_creative_families)
    || !isCount(snapshot.delta.possibly_no_longer_active)
    || !isCount(snapshot.delta.reactivated_ads)
    || !isCount(snapshot.delta.landing_page_changes)
    || !Array.isArray(snapshot.delta.collection_gaps_or_failures)) {
    throw new Error("Meta Ads Intelligence returned invalid totals or daily delta data.");
  }
  if (!Array.isArray(snapshot.competitors)
    || snapshot.competitors.some((item) => !item
      || item.verified !== true
      || typeof item.watch_id !== "string"
      || typeof item.page_id !== "string"
      || !/^\d{5,30}$/.test(item.page_id))
    || !Array.isArray(snapshot.evidence)
    || snapshot.evidence.some((item) => !item
      || typeof item.library_id !== "string"
      || typeof item.ad_library_url !== "string"
      || !item.ad_library_url.startsWith("https://www.facebook.com/ads/library/"))
    || !Array.isArray(snapshot.limitations)
    || snapshot.limitations.some((item) => typeof item !== "string" || !item.trim())
    || typeof snapshot.claims_boundary !== "string"
    || !snapshot.claims_boundary.includes("do not prove")) {
    throw new Error("Meta Ads Intelligence returned invalid evidence or limitations.");
  }
  return snapshot;
}

export function toCompetitorAdsIntelligence(
  snapshot: MetaAdsProjectSnapshot,
  links: CompetitorAdsIntelligence["links"],
  collectionReceipt?: ProviderNeutralCollectionReceipt,
): CompetitorAdsIntelligence {
  if (collectionReceipt) validateProviderNeutralCollectionReceipt(collectionReceipt);
  return {
    engine: "meta-ads-intelligence",
    profile: snapshot.profile,
    refresh_status: snapshot.refresh.status,
    last_successful_refresh_at: snapshot.refresh.last_successful_refresh_at,
    watched_competitors: snapshot.totals.watched_competitors,
    active_ads: snapshot.totals.active_ads,
    new_ads_today: snapshot.delta.new_ads,
    changed_ads: snapshot.delta.changed_ads,
    creative_families: snapshot.totals.creative_families,
    possibly_no_longer_active: snapshot.delta.possibly_no_longer_active,
    reactivated_ads: snapshot.delta.reactivated_ads,
    landing_page_changes: snapshot.delta.landing_page_changes,
    coverage_limitations: [...snapshot.limitations],
    claims_boundary: snapshot.claims_boundary,
    ...(collectionReceipt ? { collection_receipt: collectionReceipt } : {}),
    links: {
      database: secureUrl(links.database),
      report_markdown: secureUrl(links.report_markdown),
      report_csv: secureUrl(links.report_csv),
      google_sheet: secureUrl(links.google_sheet),
    },
  };
}

export function validateCompetitorAdsIntelligence(value: unknown): CompetitorAdsIntelligence {
  if (!isRecord(value)
    || value.engine !== "meta-ads-intelligence"
    || typeof value.profile !== "string"
    || typeof value.refresh_status !== "string"
    || !REFRESH_STATES.has(value.refresh_status as string)
    || !isTimestampOrNull(value.last_successful_refresh_at)
    || !isCount(value.watched_competitors)
    || !isCount(value.active_ads)
    || !isCount(value.new_ads_today)
    || !isCount(value.changed_ads)
    || !isCount(value.creative_families)
    || !isCount(value.possibly_no_longer_active)
    || !isCount(value.reactivated_ads)
    || !isCount(value.landing_page_changes)
    || !Array.isArray(value.coverage_limitations)
    || value.coverage_limitations.some((item) => typeof item !== "string" || !item.trim())
    || typeof value.claims_boundary !== "string"
    || !value.claims_boundary.includes("do not prove")
    || !isRecord(value.links)) {
    throw new Error("The competitor-ad intelligence summary is invalid.");
  }
  validateProfileId(value.profile);
  if (value.collection_receipt !== undefined) validateProviderNeutralCollectionReceipt(value.collection_receipt);
  const links = value.links as Record<string, unknown>;
  if (Object.keys(links).sort().join(",") !== "database,google_sheet,report_csv,report_markdown"
    || Object.values(links).some((link) => {
      if (link === null) return false;
      if (typeof link !== "string") return true;
      try {
        return new URL(link).protocol !== "https:";
      } catch {
        return true;
      }
    })) {
    throw new Error("The competitor-ad intelligence links are invalid.");
  }
  return value as unknown as CompetitorAdsIntelligence;
}
