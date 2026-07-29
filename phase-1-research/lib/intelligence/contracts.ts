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

export type IntelligenceIntake = {
  contract: "lead-generation-intelligence-intake";
  contract_version: "2.0";
  project_name: string;
  market_context: string;
  fields: Record<OptionalFieldId, IntakeField>;
  attachments: Array<{ name: string; size: number; type: string; last_modified: number }>;
  allowed_actions: ["public_research", "create_google_doc", "create_google_sheet"];
  research_engine: "lead-generation-ads-discovery-intelligence";
};

export type RunCapability = { available: boolean; status: "ready" | "blocked"; blocker: string | null };
type GoogleOutput = { title: string; url: string; verified: true };

export type RunResult = {
  contract: "lead-generation-intelligence-result";
  contract_version: "2.0";
  run_id: string;
  status: "complete";
  research_engine: "lead-generation-ads-discovery-intelligence";
  completed_at: string;
  outputs: {
    google_doc: GoogleOutput;
    google_sheet: GoogleOutput;
    markdown: { filename: string; content: string; mime_type: "text/markdown" };
  };
  sources: Array<{ id: string; url: string; title: string; accessed_at: string }>;
  limitations: string[];
  validation: {
    exactly_three_outputs: true;
    google_doc_readback: true;
    google_sheet_readback: true;
    markdown_doc_parity: true;
    competitor_rows_evidence_backed: true;
    citation_integrity: true;
    secret_scan_passed: true;
    example_leak_scan_passed: true;
  };
};

export type RunError = { status: "blocked" | "failed"; error: string };
