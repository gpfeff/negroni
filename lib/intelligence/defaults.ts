import { OPTIONAL_FIELD_IDS, type IntelligenceIntake, type OptionalFieldId } from "./contracts";

export const FIELD_DEFINITIONS: Array<{ id: OptionalFieldId; label: string; hint: string; kind?: "conversion" | "depth" | "urls" }> = [
  { id: "offer_service", label: "Offer or service", hint: "What is being offered or fulfilled?" },
  { id: "industry_problem", label: "Industry or problem", hint: "Category, pain, or use case" },
  { id: "geography", label: "Geography", hint: "Countries, states, regions, or service areas" },
  { id: "languages", label: "Languages", hint: "Audience and deliverable languages" },
  { id: "business_model", label: "Business model", hint: "Internal, sold lead, transfer, affiliate, marketplace…" },
  { id: "conversion_event", label: "Conversion event", hint: "Choose the intended lead event", kind: "conversion" },
  { id: "lead_buyer", label: "Lead buyer or internal user", hint: "Who receives or acts on the lead?" },
  { id: "buyer_organization_types", label: "Buyer organization types", hint: "Providers, firms, agencies, networks…" },
  { id: "end_customer_audience", label: "End-customer audience", hint: "Who becomes the lead?" },
  { id: "qualification_requirements", label: "Known qualification requirements", hint: "Eligibility, intent, call conditions, required fields…" },
  { id: "disqualifiers", label: "Known disqualifiers", hint: "Exclusions, duplicates, invalid conditions…" },
  { id: "competitors", label: "Known competitors", hint: "Names or starting URLs" },
  { id: "platforms_channels", label: "Known platforms or traffic channels", hint: "Paid social, native, video, display…" },
  { id: "economics", label: "Economics or acquisition ceiling", hint: "Payout, CPL, CPA, buyer value, or limits" },
  { id: "compliance_restrictions", label: "Compliance and source restrictions", hint: "Consent, licensing, claims, or prohibited sources" },
  { id: "research_depth", label: "Desired research depth", hint: "Scan, standard, deep, or refresh", kind: "depth" },
  { id: "urls", label: "URLs", hint: "One public, credential-free URL per line", kind: "urls" },
  { id: "additional_instructions", label: "Additional instructions", hint: "Priorities, exclusions, format, or unresolved questions" },
];

export function createEmptyIntake(): IntelligenceIntake {
  const fields = Object.fromEntries(OPTIONAL_FIELD_IDS.map((id) => [id, { state: "unknown", value: "" }])) as IntelligenceIntake["fields"];
  return {
    contract: "lead-generation-intelligence-intake", contract_version: "2.0", project_name: "", market_context: "", fields, attachments: [],
    allowed_actions: ["public_research", "create_google_doc", "create_google_sheet"], research_engine: "lead-generation-ads-discovery-intelligence",
  };
}

export const CONVERSION_OPTIONS = ["Call", "Qualified call", "Transfer", "Form lead", "Appointment", "Application", "Trial or demo", "Sale", "Custom"];
export const DEPTH_OPTIONS = ["Scan", "Standard", "Deep", "Refresh"];
