import type { CanonicalIntake, FieldStateMap, SourceReference } from "./types";
import { validateIntake } from "./preflight";
import { assertNoSecretMaterial } from "./secrets";

function text(value: string | null | undefined, fallback = "Not supplied"): string {
  if (!value?.trim()) return fallback;
  return value.trim();
}

function list(values: string[], fallback = "Not supplied"): string {
  return values.length ? values.join(", ") : fallback;
}

function sourceLine(source: SourceReference): string {
  const location = source.url ? ` — ${source.url}` : "";
  return `- ${source.name} — detected: ${source.detected_type}; role: ${source.role}; template treatment: ${source.template_treatment}; status: ${source.status}${location}`;
}

export function generateProjectBrief(
  intake: CanonicalIntake,
  fieldStates: FieldStateMap = {},
  documentDate: string | null = null,
): string {
  assertNoSecretMaterial({ intake, fieldStates }, "The project brief input");
  const preflight = validateIntake(intake, fieldStates);
  const sources = [...intake.sources.attachments, ...intake.sources.urls];
  const geography = [
    ...intake.market.countries,
    ...intake.market.regions,
    intake.market.geography_notes,
  ].filter(Boolean);
  const publisher =
    intake.brands.research_publisher.name ||
    (intake.brands.allow_provisional_document_styling
      ? "Provisional document styling"
      : "Unresolved");

  return `# 00 — Project brief

> Generated deterministically from intake schema 1.0. This brief contains no market research findings.

## Decision

- **Project:** ${text(intake.project.name)}
- **Research decision:** ${text(intake.project.research_decision)}
- **Intended users:** ${list(intake.project.intended_users)}
- **Profile:** ${intake.project.research_profile}
- **Brief date:** ${text(documentDate, "Not supplied")}
- **Requested completion date:** ${text(intake.project.requested_completion_date, "Not supplied")}
- **Preflight:** ${preflight.passed ? "Ready for research" : "Draft — minimum brief incomplete"}

## Market and conversion

- **Offer type:** ${text(intake.market.offer_type)}
- **Industry / problem:** ${text(intake.market.industry || intake.market.problem_category)}
- **Geography:** ${list(geography)}
- **Languages:** ${list(intake.market.languages)}
- **Time window:** ${text(intake.market.time_window)}
- **Acquisition model:** ${text(intake.business_model.acquisition_model)}
- **Conversion unit:** ${text(intake.business_model.conversion_unit)}
- **Underlying service or product:** ${text(intake.business_model.underlying_service_or_product)}
- **Success definition:** ${text(intake.business_model.success_definition)}

## Two-sided target

### Lead consumer / end-customer audience

${text(intake.b2c_lead_consumers.segment_definition)}

- **Qualification:** ${list(intake.b2c_lead_consumers.qualification_conditions, "Research this")}
- **Disqualification:** ${list(intake.b2c_lead_consumers.disqualification_conditions, "Research this")}
- **Exclusions:** ${list(intake.b2c_lead_consumers.consumer_exclusions, "None supplied")}

### Lead buyer

- **Relationship:** ${text(intake.b2b_lead_buyers.buyer_relationship)}
- **Organization types:** ${list(intake.b2b_lead_buyers.organization_types)}
- **Decision-maker roles:** ${list(intake.b2b_lead_buyers.decision_maker_roles)}
- **Service areas:** ${list(intake.b2b_lead_buyers.service_areas)}
- **Exclusions:** ${list(intake.b2b_lead_buyers.buyer_exclusions, "None supplied")}

## Lead product

- **Conversion definition:** ${text(intake.lead_product.conversion_definition, "Unknown")}
- **Accepted or payable event:** ${text(intake.lead_product.payable_or_accepted_event, "Unknown")}
- **Required fields or conditions:** ${list(intake.lead_product.required_fields_or_call_conditions, "Unknown")}
- **Geography:** ${list(intake.lead_product.geography, "Unknown")}
- **Operating hours:** ${text(intake.lead_product.operating_hours, "Unknown")}
- **Consent and disclosure:** ${text(intake.lead_product.consent_and_disclosure_requirements, "Unknown")}
- **Delivery:** ${text(intake.lead_product.delivery_method, "Unknown")}
- **Delivery latency:** ${text(intake.lead_product.delivery_latency, "Unknown")}
- **Exclusivity:** ${text(intake.lead_product.exclusivity, "Unknown")}
- **Duplicate policy:** ${text(intake.lead_product.duplicate_policy, "Unknown")}
- **Return or replacement policy:** ${text(intake.lead_product.return_or_replacement_policy, "Unknown")}
- **Quality feedback loop:** ${text(intake.lead_product.quality_feedback_loop, "Unknown")}
- **Tracking:** ${text(intake.lead_product.tracking_and_attribution, "Unknown")}
- **Buyer value or payout:** ${text(intake.lead_product.buyer_value_or_payout, "Unknown")}
- **Acquisition ceiling:** ${text(intake.lead_product.target_acquisition_ceiling, "Unknown")}
- **Allowed sources:** ${text(intake.lead_product.allowed_sources, "Unknown")}
- **Prohibited sources or claims:** ${text(intake.lead_product.prohibited_sources_or_claims, "Unknown")}

## Brands and publication

- **Research publisher:** ${publisher}
- **Publisher profile:** ${text(intake.brands.research_publisher.brand_profile_path_or_url)}
- **Google Doc template:** ${text(intake.brands.research_publisher.google_doc_template_url)}
- **Buyer-facing brand:** ${text(intake.brands.buyer_facing_brand.name)}
- **Buyer brand profile:** ${text(intake.brands.buyer_facing_brand.brand_profile_path_or_url)}
- **Consumer-facing brand:** ${text(intake.brands.consumer_facing_brand.name)}
- **Consumer brand profile:** ${text(intake.brands.consumer_facing_brand.brand_profile_path_or_url)}
- **Section Markdown:** ${intake.delivery.create_section_markdown ? "Requested" : "Not requested"}
- **Section Google Docs:** ${intake.delivery.create_section_google_docs ? "Requested" : "Not requested"}
- **Sharing:** ${text(intake.delivery.sharing_instruction)}

## Platforms and boundaries

- **Priority non-search platforms:** ${list(intake.channels.priority_non_search_platforms, intake.channels.recommend_platforms ? "Research engine to recommend" : "None")}
- **Excluded platforms:** ${list(intake.channels.excluded_platforms, "None")}
- **Search comparison:** ${intake.channels.include_search_comparison ? "Included by request" : "Excluded"}
- **External actions allowed:** ${list(intake.constraints.external_actions_allowed, "None")}

## Supplied sources

${sources.length ? sources.map(sourceLine).join("\n") : "No sources registered."}

### Other source references

- **First-party interviews:** ${list(intake.sources.first_party_interviews, "None")}
- **Call transcripts:** ${list(intake.sources.call_transcripts, "None")}
- **Buyer feedback or dispositions:** ${list(intake.sources.buyer_feedback_or_disposition_data, "None")}
- **Prior research:** ${list(intake.sources.prior_research, "None")}
- **Cross-source role notes:** ${list(intake.sources.source_role_notes, "None")}

## Unknowns the research should investigate

${preflight.research_unknowns.length ? preflight.research_unknowns.map((item) => `- ${item}`).join("\n") : "- None explicitly marked."}

## Assumptions and conflicts

- **Provisional styling:** ${intake.brands.allow_provisional_document_styling ? "Allowed within the restrained no-invented-brand boundary" : "Not allowed"}
- **Platform selection:** ${intake.channels.recommend_platforms ? "The research engine may recommend observable non-search platforms" : "Limited to supplied priorities"}
- **Source access:** A registered source is metadata, not proof that its contents were reviewed.
- **Mechanical conflicts:** ${
    intake.business_model.acquisition_model === "internal_lead_generation" &&
    intake.business_model.lead_is_sold_or_transferred
      ? "Internal acquisition conflicts with the sold-or-transferred flag; correct before research."
      : "None detected. Research may still expose evidence conflicts."
  }

## Exclusions

- **Data or source restrictions:** ${list(intake.constraints.data_or_source_restrictions, "None supplied")}
- **Compliance or reputation concerns:** ${list(intake.constraints.compliance_or_reputation_concerns, "None supplied")}
- **Competitors excluded:** ${list(intake.constraints.competitors_to_exclude, "None supplied")}
- **Additional exclusions:** ${list(intake.constraints.additional_exclusions, "None supplied")}

## Unresolved launch gates

${preflight.launch_gates.length ? preflight.launch_gates.map((item) => `- ${item}`).join("\n") : "- None identified from the saved intake."}

## Approval boundary

Research and review only. The recorded external-action allowlist is planning metadata and defaults to empty; this brief does not independently authorize action. The bounded MVP executor requires an empty allowlist. No campaign, traffic, spend, outreach, purchase, form submission, call, routing, publishing, sharing change, or other live mutation is performed by this run.
`;
}
