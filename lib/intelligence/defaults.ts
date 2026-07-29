import { PROMPT_SOURCE_DOCUMENT_ID, RESEARCH_PROMPTS, type IntelligenceIntake } from "./contracts";

export function createEmptyIntake(timezone = "UTC"): IntelligenceIntake {
  return {
    contract: "lead-generation-intelligence-intake",
    contract_version: "4.0",
    offer_or_lead_type: "",
    industry: "",
    country_region: "",
    target_age_range: "",
    allowed_actions: ["public_research", "create_google_doc", "create_google_sheet", "configure_nightly_competitor_monitor"],
    research_engine: "lead-generation-ads-discovery-intelligence",
    prompt_source: {
      document_id: PROMPT_SOURCE_DOCUMENT_ID,
      prompt_ids: [...RESEARCH_PROMPTS] as unknown as typeof RESEARCH_PROMPTS,
    },
    competitor_monitoring: {
      enabled: true,
      engine: "meta-ads-intelligence",
      cadence: "nightly",
      local_time: "02:17",
      timezone,
    },
  };
}
