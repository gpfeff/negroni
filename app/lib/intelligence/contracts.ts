import type {
  CompetitorAdsIntelligence,
  ProviderNeutralCollectionReceipt,
  ResearchArtifactReceipts,
} from "@/lib/meta-ads/contracts";

export const PROMPT_SOURCE_DOCUMENT_ID = "1lbwCUUeJnqung5JZJwJGVq-20u3UOgMqaaqMYUcrb9o";

export const RESEARCH_PROMPTS = [
  "market_awareness",
  "competitor_research",
  "customer_avatar_psychographics",
  "master_marketing_intelligence",
  "brand_tone_of_voice",
] as const;
export type ResearchPromptId = (typeof RESEARCH_PROMPTS)[number];

export type CompetitorMonitoringRequest = {
  enabled: boolean;
  engine: "meta-ads-intelligence";
  cadence: "nightly";
  local_time: "02:17";
  timezone: string;
};

export type IntelligenceIntake = {
  contract: "lead-generation-intelligence-intake";
  contract_version: "5.0";
  client_customer_name: string;
  profession_job_title: string;
  company_name: string;
  website_or_public_profile_url: string;
  service_or_offer_purchased: string;
  competitor_used: string;
  offer_or_lead_type: string;
  industry: string;
  country_region: string;
  target_age_range: string;
  approved_prompt: string;
  create_competitor_database: boolean;
  allowed_actions: ["public_research", "create_google_doc", "create_google_sheet", "configure_nightly_competitor_monitor"];
  research_engine: "lead-generation-ads-discovery-intelligence";
  prompt_source: {
    document_id: typeof PROMPT_SOURCE_DOCUMENT_ID;
    prompt_ids: typeof RESEARCH_PROMPTS;
  };
  competitor_monitoring: CompetitorMonitoringRequest;
};

export type RunCapability = { available: boolean; status: "ready" | "blocked"; blocker: string | null };
type GoogleOutput = { title: string; url: string; verified: true };
type GoogleSheetOutput = {
  title: string;
  status: "published";
  url: string;
  verified: true;
} | {
  title: string;
  status: "not_configured";
  url: null;
  verified: false;
  message: "Google publishing not configured.";
};

export type CompetitorMonitoringReceipt = {
  engine: "meta-ads-intelligence";
  cadence: "nightly";
  local_time: "02:17";
  timezone: string;
  status: "active" | "blocked";
  schedule_id: string | null;
  watch_count: number;
  last_run_at: string | null;
  next_run_at: string | null;
  blocker: string | null;
};

export type PromptExecutionReceipt = {
  source_document_id: typeof PROMPT_SOURCE_DOCUMENT_ID;
  source_modified_at: string;
  prompts: Record<ResearchPromptId, {
    status: "complete" | "limited";
    limitation: string | null;
  }>;
};

export type RunResult = {
  contract: "lead-generation-intelligence-result";
  contract_version: "4.0";
  run_id: string;
  status: "complete" | "partial";
  research_engine: "lead-generation-ads-discovery-intelligence";
  completed_at: string;
  outputs: {
    google_doc: GoogleOutput;
    google_sheet: GoogleSheetOutput;
    markdown: { filename: string; content: string; mime_type: "text/markdown" };
  };
  sources: Array<{ id: string; url: string; title: string; accessed_at: string }>;
  limitations: string[];
  prompt_execution: PromptExecutionReceipt;
  competitor_monitoring: CompetitorMonitoringReceipt;
  competitor_ads: CompetitorAdsIntelligence;
  competitor_collection?: ProviderNeutralCollectionReceipt;
  research_artifacts: ResearchArtifactReceipts;
  validation: {
    exactly_three_outputs: true;
    google_doc_readback: true;
    google_sheet_projection_checked: true;
    markdown_doc_parity: true;
    competitor_rows_evidence_backed: true;
    citation_integrity: true;
    secret_scan_passed: true;
    example_leak_scan_passed: true;
    five_prompt_sequence_verified: true;
    competitor_monitor_receipt_verified: true;
    competitor_ads_intelligence_verified: true;
    research_artifacts_verified: true;
  };
};

export type RunError = { status: "blocked" | "failed"; error: string };

export type ResearchProfile = {
  id: string;
  client_customer_name: string;
  profession_job_title: string;
  company_name: string;
  website_or_public_profile_url: string;
  service_or_offer_purchased: string;
  competitor_used: string;
  offer_or_lead_type: string;
  industry: string;
  country_region: string;
  target_age_range: string;
  created_at: string;
  updated_at: string;
};

export type ProfilesResponse = {
  available: boolean;
  records: ResearchProfile[];
  blocker: string | null;
};

export type ProviderStatus = {
  provider: "codex_cli" | "claude_code" | "gemini_api" | "gemini_oauth" | "kie_ai" | "apify" | "google_drive";
  status: "connected" | "not_connected" | "blocked";
  blocker: string | null;
  detail?: string | null;
  account_email?: string | null;
  folder_id?: string | null;
  folder_name?: string | null;
  auto_store?: boolean;
};

export type SettingsResponse = {
  available: boolean;
  providers: ProviderStatus[];
  blocker: string | null;
};
