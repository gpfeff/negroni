export const FIELD_STATES = ["answered", "unknown", "research_this", "not_applicable"] as const;
export type FieldState = (typeof FIELD_STATES)[number];
export type IntakeField = { state: FieldState; value: string };

export const OPTIONAL_FIELD_IDS = [
  "offer_service", "industry_problem", "geography", "languages", "business_model",
  "conversion_event", "lead_buyer", "buyer_organization_types", "end_customer_audience",
  "qualification_requirements", "disqualifiers", "competitors", "platforms_channels",
  "economics", "compliance_restrictions", "research_depth", "urls", "additional_instructions",
] as const;
export type OptionalFieldId = (typeof OPTIONAL_FIELD_IDS)[number];

export type CompetitorMonitoringRequest = {
  enabled: true;
  engine: "meta-ads-intelligence";
  cadence: "nightly";
  local_time: "02:17";
  timezone: string;
};

export type IntelligenceIntake = {
  contract: "lead-generation-intelligence-intake";
  contract_version: "3.0";
  project_name: string;
  market_context: string;
  fields: Record<OptionalFieldId, IntakeField>;
  attachments: Array<{ name: string; size: number; type: string; last_modified: number }>;
  allowed_actions: ["public_research", "create_google_doc", "create_google_sheet", "configure_nightly_competitor_monitor"];
  research_engine: "lead-generation-ads-discovery-intelligence";
  competitor_monitoring: CompetitorMonitoringRequest;
};

export type RunCapability = { available: boolean; status: "ready" | "blocked"; blocker: string | null };
type GoogleOutput = { title: string; url: string; verified: true };

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

export const RESEARCH_LANES = [
  "client",
  "market_awareness",
  "b2b_lead_buyer",
  "b2c_customer",
  "competitors",
  "master_synthesis",
] as const;
export type ResearchLane = (typeof RESEARCH_LANES)[number];
export type ResearchCoverage = Record<ResearchLane, {
  status: "complete" | "limited";
  limitation: string | null;
}>;

export type RunResult = {
  contract: "lead-generation-intelligence-result";
  contract_version: "3.0";
  run_id: string;
  status: "complete" | "partial";
  research_engine: "lead-generation-ads-discovery-intelligence";
  completed_at: string;
  outputs: {
    google_doc: GoogleOutput;
    google_sheet: GoogleOutput;
    markdown: { filename: string; content: string; mime_type: "text/markdown" };
  };
  sources: Array<{ id: string; url: string; title: string; accessed_at: string }>;
  limitations: string[];
  research_coverage: ResearchCoverage;
  competitor_monitoring: CompetitorMonitoringReceipt;
  validation: {
    exactly_three_outputs: true;
    google_doc_readback: true;
    google_sheet_readback: true;
    markdown_doc_parity: true;
    competitor_rows_evidence_backed: true;
    citation_integrity: true;
    secret_scan_passed: true;
    example_leak_scan_passed: true;
    research_coverage_verified: true;
    competitor_monitor_receipt_verified: true;
  };
};

export type RunError = { status: "blocked" | "failed"; error: string };
