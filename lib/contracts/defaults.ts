import type {
  CanonicalIntake,
  DocumentContractRecord,
  LaneId,
  LaneRecord,
  ProjectRecord,
} from "./types";

export const SECTION_CONTRACT = [
  ["00", "Project Brief", "00-project-brief.md"],
  ["01", "Market Awareness", "01-market-awareness.md"],
  ["02", "B2B Lead-Buyer Intelligence", "02-b2b-lead-buyer-intelligence.md"],
  [
    "03",
    "B2C Lead-Consumer Intelligence",
    "03-b2c-lead-consumer-intelligence.md",
  ],
  [
    "04",
    "Competitor, Ad & Funnel Intelligence",
    "04-competitor-ad-and-funnel-intelligence.md",
  ],
  [
    "05",
    "Lead Product & Qualification Specification",
    "05-lead-product-and-qualification-spec.md",
  ],
  [
    "06",
    "Messaging & Creative Strategy",
    "06-messaging-and-creative-strategy.md",
  ],
  ["07", "Funnel Blueprint", "07-funnel-blueprint.md"],
  ["08", "Brand & Tone of Voice", "08-brand-and-tone-of-voice.md"],
  [
    "09",
    "Master Marketing Intelligence",
    "09-master-marketing-intelligence.md",
  ],
] as const;

export const SUPPORTING_OUTPUT_CONTRACT = [
  {
    path: "evidence-ledger.csv",
    condition: "Created when evidence records exist.",
  },
  {
    path: "platform-matrix.csv",
    condition: "Created when platform research is attempted.",
  },
  {
    path: "research-query-log.csv",
    condition: "Required for standard and deep platform research.",
  },
  {
    path: "document-manifest.json",
    condition: "Created only after native Google Docs exist.",
  },
  {
    path: "captures/",
    condition: "Created only for permitted local source captures.",
  },
  {
    path: "captures/manifest.json",
    condition: "Created only when captures exist.",
  },
] as const;

export const LANE_TITLES: Record<LaneId, string> = {
  project_brief: "Project brief",
  market_awareness: "Market awareness",
  b2b_buyer_intelligence: "B2B lead-buyer intelligence",
  b2c_consumer_intelligence: "B2C lead-consumer intelligence",
  competitor_ad_funnel: "Competitor, ad & funnel intelligence",
  lead_product_specification: "Lead product & qualification",
  messaging_creative_strategy: "Messaging & creative strategy",
  funnel_blueprint: "Funnel blueprint",
  brand_tone: "Brand & tone of voice",
  master_intelligence: "Master marketing intelligence",
  google_docs_publication: "Google Docs publication",
};

export function createLaneRecords(): LaneRecord[] {
  return (Object.keys(LANE_TITLES) as LaneId[]).map((id) => ({
    id,
    title: LANE_TITLES[id],
    state: id === "project_brief" ? "ready" : "not_started",
    evidence_summary:
      id === "project_brief"
        ? "Built deterministically from the saved intake."
        : "No evidence reviewed.",
    last_updated: null,
    blocker: null,
    artifact_ids: [],
  }));
}

export function createDocumentContract(): DocumentContractRecord[] {
  return SECTION_CONTRACT.map(([section_id, title, markdown_path]) => ({
    section_id,
    title,
    markdown_path,
    markdown_state: "planned",
    google_doc_state: "not_published",
    parity_state: "unverified",
    google_doc_url: null,
    limitation:
      "No native Google Doc has been created or read back. document-manifest.json does not exist.",
  }));
}

export function createEmptyIntake(): CanonicalIntake {
  return {
    schema_version: "1.0",
    project: {
      name: "",
      research_decision: "",
      intended_users: [],
      research_profile: "standard",
      requested_completion_date: null,
      notes: "",
    },
    market: {
      offer_type: "",
      industry: "",
      subcategory: "",
      problem_category: "",
      countries: [],
      regions: [],
      geography_notes: "",
      languages: [],
      time_window: "current",
      known_seasonality: "unknown",
    },
    business_model: {
      acquisition_model: "",
      conversion_unit: "",
      lead_is_for_internal_use: false,
      lead_is_sold_or_transferred: false,
      underlying_service_or_product: "",
      known_value_chain: "",
      success_definition: "",
    },
    b2b_lead_buyers: {
      buyer_relationship: "external_or_internal",
      organization_types: [],
      decision_maker_roles: [],
      company_size_or_maturity: [],
      service_areas: [],
      capacity_and_hours: "unknown",
      intake_workflow: "unknown",
      crm_or_routing_systems: [],
      desired_volume: "unknown",
      delivery_preferences: [],
      speed_to_lead_expectation: "unknown",
      lead_quality_definition: "research_this",
      proof_required: "research_this",
      common_objections: "research_this",
      vendor_or_channel_history: "unknown",
      commercial_constraints: "unknown",
      source_permissions: "unknown",
      buyer_exclusions: [],
    },
    b2c_lead_consumers: {
      segment_definition: "",
      demographic_or_firmographic_boundaries: [],
      situational_boundaries: [],
      trigger_events: "research_this",
      known_awareness_stage: "research_this",
      desired_outcomes: "research_this",
      decision_roles_or_gatekeepers: "research_this",
      known_objections: "research_this",
      trust_requirements: "research_this",
      qualification_conditions: [],
      disqualification_conditions: [],
      accessibility_or_language_needs: [],
      consumer_exclusions: [],
    },
    lead_product: {
      conversion_definition: "",
      payable_or_accepted_event: "unknown",
      required_fields_or_call_conditions: [],
      geography: [],
      operating_hours: "unknown",
      consent_and_disclosure_requirements: "unknown",
      delivery_method: "unknown",
      delivery_latency: "unknown",
      exclusivity: "unknown",
      duplicate_policy: "unknown",
      return_or_replacement_policy: "unknown",
      quality_feedback_loop: "unknown",
      tracking_and_attribution: "unknown",
      buyer_value_or_payout: "unknown",
      target_acquisition_ceiling: "unknown",
      allowed_sources: "unknown",
      prohibited_sources_or_claims: "unknown",
    },
    brands: {
      research_publisher: {
        name: "",
        brand_profile_path_or_url: null,
        google_doc_template_url: null,
        assets: [],
      },
      buyer_facing_brand: {
        name: null,
        brand_profile_path_or_url: null,
        assets: [],
      },
      consumer_facing_brand: {
        name: null,
        brand_profile_path_or_url: null,
        assets: [],
      },
      allow_provisional_document_styling: true,
    },
    channels: {
      priority_non_search_platforms: [],
      excluded_platforms: [],
      recommend_platforms: true,
      include_search_comparison: false,
      known_accounts_or_advertisers: [],
    },
    sources: {
      attachments: [],
      urls: [],
      first_party_interviews: [],
      call_transcripts: [],
      buyer_feedback_or_disposition_data: [],
      prior_research: [],
      source_role_notes: [],
    },
    constraints: {
      budget_for_paid_data: 0,
      data_or_source_restrictions: [],
      compliance_or_reputation_concerns: [],
      competitors_to_include: [],
      competitors_to_exclude: [],
      external_actions_allowed: [],
      additional_exclusions: [],
    },
    delivery: {
      local_output_root: null,
      google_drive_folder_url: null,
      create_section_markdown: true,
      create_section_google_docs: true,
      create_master_markdown: true,
      create_master_google_doc: true,
      sharing_instruction: "owner_only",
      additional_formats: [],
      reviewers: [],
    },
  };
}

export function createBlankProject(now = new Date().toISOString()): ProjectRecord {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}`,
    created_at: now,
    updated_at: now,
    state: "draft",
    intake: createEmptyIntake(),
    field_states: {
      "b2b_lead_buyers.buyer_relationship": "blank",
    },
    raw_answers: {},
    is_synthetic_demo: false,
    current_blocker: "Complete the minimum viable brief.",
    run_manifest: null,
  };
}
