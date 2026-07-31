export const COMPETITOR_RESEARCH_CONTRACT_VERSION = "1.0" as const;
export const WINNER_SIGNAL_VERSION = "public-winner-signal-v2" as const;

export const RUN_STATES = [
  "created",
  "running",
  "complete",
  "complete_zero",
  "partial",
  "suspect",
  "blocked",
  "skipped",
  "failed",
] as const;
export type RunState = (typeof RUN_STATES)[number];
export type CollectionState = RunState | "unsupported";

export const LIFECYCLE_STATES = [
  "unknown",
  "active",
  "possibly_inactive",
  "inactive",
  "reactivated",
] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

export const MEDIA_STATES = [
  "not_requested",
  "pending",
  "downloaded",
  "reused",
  "inaccessible",
  "disallowed",
  "failed",
] as const;
export type MediaState = (typeof MEDIA_STATES)[number];

export const OUTBOX_STATES = [
  "pending",
  "drive_uploaded",
  "sheet_linked",
  "complete",
] as const;
export type OutboxState = (typeof OUTBOX_STATES)[number];

export const REVIEW_STATES = [
  "unreviewed",
  "needs_review",
  "approved",
  "rejected",
  "corrected",
] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

export const PUBLIC_EVIDENCE_CLAIMS_BOUNDARY =
  "Observed public durability does not prove spend, conversions, CPA, ROAS, revenue, profit, or a verified winner.";

export const PROVIDER_NAMES = ["normalized_import", "official_meta_api", "foreplay_api"] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];
export type IdentityBasis = "platform_public_ad_id" | "stable_source_locator" | "content_locator";
export type EvidenceConfidence = "high" | "medium" | "low" | "unknown";

export type Unknownable<T> = {
  value: T | null;
  reason: string | null;
};

export type StableAdIdentity = {
  ad_record_id: string;
  identity_basis: IdentityBasis;
  identity_confidence: "high" | "medium" | "low";
  low_confidence_reason: string | null;
  auto_merge_allowed: boolean;
  full_identity_sha256: string;
  identity_input: string;
};

export type NormalizedAd = {
  contract: "negroni-normalized-ad";
  contract_version: typeof COMPETITOR_RESEARCH_CONTRACT_VERSION;
  project_id: string;
  ad_record_id: string;
  platform: string;
  provider: ProviderName;
  public_ad_id: string | null;
  identity_basis: IdentityBasis;
  identity_confidence: "high" | "medium" | "low";
  identity_reason: string | null;
  advertiser_id: string;
  advertiser_name: string;
  competitor_id: string;
  source_url: string;
  first_observed_at: string;
  last_observed_at: string;
  lifecycle_status: LifecycleState;
  successful_observations: number;
  missed_eligible_observations: number;
  days_observed_active: number;
  observed_span_days: number;
  copy: Unknownable<string>;
  headline: Unknownable<string>;
  cta: Unknownable<string>;
  landing_page_url: Unknownable<string>;
  creative_format: Unknownable<string>;
  content_version_id: string;
  creative_family_id: string | null;
  collection_status: CollectionState;
  evidence_confidence: EvidenceConfidence;
  limitations: string[];
  source_payload_sha256: string;
};

export type WinnerSignalComponents = {
  observed_durability: number;
  complete_scan_continuity: number;
  creative_family_reuse: number;
  same_offer_across_formats: number;
  expansion_breadth: number;
  advertiser_repeated_pattern: number;
  evidence_completeness: number;
};

export type WinnerSignal = {
  score_version: typeof WINNER_SIGNAL_VERSION;
  ad_record_id: string;
  score: number;
  confidence: EvidenceConfidence;
  classification:
    | "insufficient_evidence"
    | "limited_signal"
    | "emerging_durability"
    | "durable_public_pattern"
    | "strong_public_durability";
  awarded: WinnerSignalComponents;
  unknown_components: string[];
  explanation: string;
  computed_at: string;
};

export type ResearchCreativeHandoff = {
  contract: "negroni-research-creative-handoff";
  contract_version: typeof COMPETITOR_RESEARCH_CONTRACT_VERSION;
  research_revision_id: string;
  research_sha256: string;
  creative_brief_sha256: string;
  approval_status: "approved";
  evidence_ids: string[];
  unknowns: string[];
  originality_rule: string;
  approved_at: string;
};
