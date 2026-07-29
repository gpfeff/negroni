export const ANSWER_STATES = [
  "blank",
  "known",
  "unknown",
  "research_this",
  "not_applicable",
] as const;

export type AnswerState = (typeof ANSWER_STATES)[number];
export type FieldStateMap = Record<string, AnswerState>;
export type RawAnswerMap = Record<string, string>;

export const ACQUISITION_MODELS = [
  "internal_lead_generation",
  "sell_leads",
  "agency_or_client_delivery",
  "marketplace_or_matching",
  "affiliate_or_referral",
  "hybrid",
  "other",
] as const;

export const CONVERSION_UNITS = [
  "form_lead",
  "inbound_call",
  "qualified_call",
  "live_transfer",
  "appointment",
  "application",
  "quote_request",
  "trial_or_demo",
  "sale",
  "custom_event",
] as const;

export const RESEARCH_PROFILES = [
  "scan",
  "standard",
  "deep",
  "refresh",
] as const;

export type AcquisitionModel = (typeof ACQUISITION_MODELS)[number] | "";
export type ConversionUnit = (typeof CONVERSION_UNITS)[number] | "";
export type ResearchProfile = (typeof RESEARCH_PROFILES)[number];

export const SOURCE_ROLES = [
  "factual_source",
  "first_party_evidence",
  "template",
  "adaptable_reference",
  "past_example",
  "content_only_source",
  "competitor_seed",
  "exclude_from_final_facts",
] as const;

export type SourceRole = (typeof SOURCE_ROLES)[number];
export const TEMPLATE_TREATMENTS = [
  "unassigned",
  "exact_template",
  "adaptable_template",
  "selective_reference",
  "past_example",
  "content_only",
  "not_applicable",
] as const;
export type TemplateTreatment = (typeof TEMPLATE_TREATMENTS)[number];
export type SourceKind = "local_file" | "url";
export type SourceStatus =
  | "registered"
  | "available"
  | "unavailable"
  | "excluded";

export interface SourceReference {
  id: string;
  kind: SourceKind;
  name: string;
  url: string | null;
  declared_type: string;
  detected_type: string;
  role: SourceRole;
  template_treatment: TemplateTreatment;
  status: SourceStatus;
  notes: string;
  byte_size: number | null;
  last_modified: string | null;
}

export interface CanonicalIntake {
  schema_version: "1.0";
  project: {
    name: string;
    research_decision: string;
    intended_users: string[];
    research_profile: ResearchProfile;
    requested_completion_date: string | null;
    notes: string;
  };
  market: {
    offer_type: string;
    industry: string;
    subcategory: string;
    problem_category: string;
    countries: string[];
    regions: string[];
    geography_notes: string;
    languages: string[];
    time_window: string;
    known_seasonality: string;
  };
  business_model: {
    acquisition_model: AcquisitionModel;
    conversion_unit: ConversionUnit;
    lead_is_for_internal_use: boolean;
    lead_is_sold_or_transferred: boolean;
    underlying_service_or_product: string;
    known_value_chain: string;
    success_definition: string;
  };
  b2b_lead_buyers: {
    buyer_relationship: string;
    organization_types: string[];
    decision_maker_roles: string[];
    company_size_or_maturity: string[];
    service_areas: string[];
    capacity_and_hours: string;
    intake_workflow: string;
    crm_or_routing_systems: string[];
    desired_volume: string;
    delivery_preferences: string[];
    speed_to_lead_expectation: string;
    lead_quality_definition: string;
    proof_required: string;
    common_objections: string;
    vendor_or_channel_history: string;
    commercial_constraints: string;
    source_permissions: string;
    buyer_exclusions: string[];
  };
  b2c_lead_consumers: {
    segment_definition: string;
    demographic_or_firmographic_boundaries: string[];
    situational_boundaries: string[];
    trigger_events: string;
    known_awareness_stage: string;
    desired_outcomes: string;
    decision_roles_or_gatekeepers: string;
    known_objections: string;
    trust_requirements: string;
    qualification_conditions: string[];
    disqualification_conditions: string[];
    accessibility_or_language_needs: string[];
    consumer_exclusions: string[];
  };
  lead_product: {
    conversion_definition: string;
    payable_or_accepted_event: string;
    required_fields_or_call_conditions: string[];
    geography: string[];
    operating_hours: string;
    consent_and_disclosure_requirements: string;
    delivery_method: string;
    delivery_latency: string;
    exclusivity: string;
    duplicate_policy: string;
    return_or_replacement_policy: string;
    quality_feedback_loop: string;
    tracking_and_attribution: string;
    buyer_value_or_payout: string;
    target_acquisition_ceiling: string;
    allowed_sources: string;
    prohibited_sources_or_claims: string;
  };
  brands: {
    research_publisher: {
      name: string;
      brand_profile_path_or_url: string | null;
      google_doc_template_url: string | null;
      assets: string[];
    };
    buyer_facing_brand: {
      name: string | null;
      brand_profile_path_or_url: string | null;
      assets: string[];
    };
    consumer_facing_brand: {
      name: string | null;
      brand_profile_path_or_url: string | null;
      assets: string[];
    };
    allow_provisional_document_styling: boolean;
  };
  channels: {
    priority_non_search_platforms: string[];
    excluded_platforms: string[];
    recommend_platforms: boolean;
    include_search_comparison: boolean;
    known_accounts_or_advertisers: string[];
  };
  sources: {
    attachments: SourceReference[];
    urls: SourceReference[];
    first_party_interviews: string[];
    call_transcripts: string[];
    buyer_feedback_or_disposition_data: string[];
    prior_research: string[];
    source_role_notes: string[];
  };
  constraints: {
    budget_for_paid_data: number;
    data_or_source_restrictions: string[];
    compliance_or_reputation_concerns: string[];
    competitors_to_include: string[];
    competitors_to_exclude: string[];
    external_actions_allowed: string[];
    additional_exclusions: string[];
  };
  delivery: {
    local_output_root: string | null;
    google_drive_folder_url: string | null;
    create_section_markdown: boolean;
    create_section_google_docs: boolean;
    create_master_markdown: boolean;
    create_master_google_doc: boolean;
    sharing_instruction: string;
    additional_formats: string[];
    reviewers: string[];
  };
}

export const PROJECT_STATES = [
  "draft",
  "ready",
  "researching",
  "needs_review",
  "partial",
  "complete",
  "failed",
] as const;

export type ProjectState = (typeof PROJECT_STATES)[number];

export const LANE_IDS = [
  "project_brief",
  "market_awareness",
  "b2b_buyer_intelligence",
  "b2c_consumer_intelligence",
  "competitor_ad_funnel",
  "lead_product_specification",
  "messaging_creative_strategy",
  "funnel_blueprint",
  "brand_tone",
  "master_intelligence",
  "google_docs_publication",
] as const;

export type LaneId = (typeof LANE_IDS)[number];
export type LaneState =
  | "not_started"
  | "ready"
  | "researching"
  | "needs_review"
  | "partial"
  | "complete"
  | "failed"
  | "blocked";

export interface LaneRecord {
  id: LaneId;
  title: string;
  state: LaneState;
  evidence_summary: string;
  last_updated: string | null;
  blocker: string | null;
  artifact_ids: string[];
}

export const EVIDENCE_CLASSES = [
  "observed",
  "corroborated",
  "inference",
  "synthesis",
  "recommendation",
  "hypothesis",
] as const;

export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];

export interface EvidenceRecord {
  evidence_id: string;
  claim_or_record: string;
  evidence_class: EvidenceClass;
  audience_side:
    | "buyer"
    | "consumer"
    | "both"
    | "market"
    | "platform"
    | "other";
  speaker_role: string;
  source_type: string;
  platform: string;
  principal: string;
  url_or_path: string;
  accessed_at: string;
  represented_date: string;
  geography: string;
  query_context: string;
  excerpt_or_fields: string;
  local_capture: string;
  limitation: string;
}

export interface FindingRecord {
  id: string;
  title: string;
  statement: string;
  evidence_class: EvidenceClass;
  evidence_ids: string[];
  limitation: string;
  audience_side: "buyer" | "consumer" | "both";
}

export interface ArtifactRecord {
  id: string;
  section_id: string;
  title: string;
  markdown_path: string;
  markdown: string;
  state: "generated" | "fixture_preview" | "planned" | "blocked";
  limitation: string | null;
}

export interface DocumentContractRecord {
  section_id: string;
  title: string;
  markdown_path: string;
  markdown_state: "generated" | "fixture_preview" | "planned" | "blocked";
  google_doc_state: "not_published" | "published_unverified" | "verified";
  parity_state:
    | "matched"
    | "google_newer"
    | "markdown_newer"
    | "material_difference"
    | "unverified";
  google_doc_url: string | null;
  limitation: string;
}

export interface RunManifest {
  schema_version: "1.0";
  run_id: string;
  project_id: string;
  mode: "codex_app_server" | "deterministic_fixture";
  synthetic: boolean;
  synthetic_label: string | null;
  adapter_version: string;
  skill_name: string;
  skill_path: string | null;
  skill_bundle_sha256: string | null;
  codex_version: string | null;
  thread_id: string | null;
  started_at: string;
  completed_at: string | null;
  state: ProjectState;
  lanes: LaneRecord[];
  evidence: EvidenceRecord[];
  findings: FindingRecord[];
  artifacts: ArtifactRecord[];
  documents: DocumentContractRecord[];
  blockers: string[];
  limitations: string[];
  validation: {
    schema_valid: boolean;
    evidence_ids_unique: boolean;
    external_actions_empty: boolean;
    example_leak_scan_passed: boolean | null;
  };
}

export interface ProjectRecord {
  id: string;
  created_at: string;
  updated_at: string;
  state: ProjectState;
  intake: CanonicalIntake;
  field_states: FieldStateMap;
  raw_answers: RawAnswerMap;
  is_synthetic_demo: boolean;
  current_blocker: string | null;
  run_manifest: RunManifest | null;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface PreflightResult {
  passed: boolean;
  issues: ValidationIssue[];
  research_unknowns: string[];
  launch_gates: string[];
  proposed_platforms: string[];
  excluded_platforms: string[];
  expected_outputs: DocumentContractRecord[];
  external_actions_allowed: string[];
}

export interface IntakePackage {
  contract: "lead-generation-intelligence-intake";
  contract_version: "1.0";
  intake: CanonicalIntake;
  field_states: FieldStateMap;
  raw_answers: RawAnswerMap;
  source_manifest: SourceReference[];
}
