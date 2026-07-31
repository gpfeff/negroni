import { PROMPT_SOURCE_DOCUMENT_ID, RESEARCH_PROMPTS, type IntelligenceIntake } from "./contracts";

export const DEFAULT_RESEARCH_PROMPT = `Run this lead-generation Research workflow with Gemini Deep Research.

Execute the steps in order: 1) Market Awareness Research, 2) Competitor Research, 3) Psychographic Avatar Research, 4A) synthesize the cited outputs of steps 1–3 into the Master Research Document, and 4B) use that Master Research Document to create the Brand Tone of Voice guide.

Keep the work vertical-agnostic and use the intake answers below. Cite material claims with public URLs and access dates. Label facts, estimates, inferences, hypotheses, unknowns, conflicts, confidence, and limitations. Do not invent market size, awareness percentages, quotations, targeting, spend, conversions, lead quality, CPA, ROAS, revenue, or profitability. Use direct quotations only when an exact public source is retained; otherwise paraphrase.

Return one approved brand-scoped content revision rendered as a polished Google Doc for humans and content-equivalent Markdown for Negroni Creative.`;

export function createEmptyIntake(timezone = "UTC"): IntelligenceIntake {
  return {
    contract: "lead-generation-intelligence-intake",
    contract_version: "5.0",
    client_customer_name: "",
    profession_job_title: "",
    company_name: "",
    website_or_public_profile_url: "",
    service_or_offer_purchased: "",
    competitor_used: "",
    offer_or_lead_type: "",
    industry: "",
    country_region: "",
    target_age_range: "",
    approved_prompt: DEFAULT_RESEARCH_PROMPT,
    create_competitor_database: false,
    allowed_actions: ["public_research", "create_google_doc", "create_google_sheet", "configure_nightly_competitor_monitor"],
    research_engine: "lead-generation-ads-discovery-intelligence",
    prompt_source: {
      document_id: PROMPT_SOURCE_DOCUMENT_ID,
      prompt_ids: [...RESEARCH_PROMPTS] as unknown as typeof RESEARCH_PROMPTS,
    },
    competitor_monitoring: {
      enabled: false,
      engine: "meta-ads-intelligence",
      cadence: "nightly",
      local_time: "02:17",
      timezone,
    },
  };
}
