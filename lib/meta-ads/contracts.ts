export const RESEARCH_ARTIFACT_FILENAMES = {
  research_brief: "research-brief.md",
  evidence_index: "evidence-index.json",
  opportunity_map: "opportunity-map.json",
  creative_brief: "creative-brief.json",
  research_receipt: "research-receipt.json",
} as const;

export type ResearchArtifactKey = keyof typeof RESEARCH_ARTIFACT_FILENAMES;

export type ResearchArtifactReceipt = {
  filename: (typeof RESEARCH_ARTIFACT_FILENAMES)[ResearchArtifactKey];
  sha256: string;
  verified: true;
};
export type ResearchArtifactReceipts = Record<ResearchArtifactKey, ResearchArtifactReceipt>;

export type MetaAdsEvidence = {
  library_id: string;
  advertiser_name: string;
  lifecycle_status: string;
  first_observed_at: string;
  last_observed_at: string;
  ad_library_url: string;
};

export type MetaAdsProjectSnapshot = {
  contract: "meta-ads-intelligence-project-snapshot";
  contract_version: "1.0";
  profile: string;
  generated_at: string;
  refresh: {
    nightly_run_id: string | null;
    status: "complete" | "complete_zero" | "partial" | "suspect" | "blocked" | "skipped" | "failed" | "never_run";
    started_at: string | null;
    completed_at: string | null;
    last_successful_refresh_at: string | null;
  };
  competitors: Array<{
    watch_id: string;
    page_id: string;
    advertiser_name: string;
    verified: true;
  }>;
  discovery_watch_count: number;
  totals: {
    watched_competitors: number;
    active_ads: number;
    creative_families: number;
    lifecycle: Record<string, number>;
  };
  delta: {
    new_ads: number;
    changed_ads: number;
    newly_observed_creative_families: number;
    possibly_no_longer_active: number;
    reactivated_ads: number;
    landing_page_changes: number;
    collection_gaps_or_failures: Array<{
      watch_id: string;
      status: string;
      coverage_complete: boolean;
      error: string;
    }>;
  };
  scheduler: {
    owner: string;
    external_job_id: string;
    cadence: string;
    enabled: boolean;
    verified_at: string | null;
  } | null;
  google: {
    status: "not_configured";
    message: "Google publishing not configured.";
  };
  reports: {
    database_locator: "meta-ads.sqlite3";
    markdown_locator: string | null;
    csv_locator: string | null;
  };
  evidence: MetaAdsEvidence[];
  limitations: string[];
  claims_boundary: string;
};

export type CompetitorAdsIntelligence = {
  engine: "meta-ads-intelligence";
  profile: string;
  refresh_status: MetaAdsProjectSnapshot["refresh"]["status"];
  last_successful_refresh_at: string | null;
  watched_competitors: number;
  active_ads: number;
  new_ads_today: number;
  changed_ads: number;
  creative_families: number;
  possibly_no_longer_active: number;
  reactivated_ads: number;
  landing_page_changes: number;
  coverage_limitations: string[];
  claims_boundary: string;
  links: {
    database: string | null;
    report_markdown: string | null;
    report_csv: string | null;
    google_sheet: string | null;
  };
};

export type ResearchArtifactBundle = {
  research_brief: string;
  evidence_index: Record<string, unknown>;
  opportunity_map: Record<string, unknown>;
  creative_brief: Record<string, unknown>;
  research_receipt: Record<string, unknown>;
};
