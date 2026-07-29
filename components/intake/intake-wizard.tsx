"use client";

import { useState } from "react";
import { QuestionField, CheckField } from "./question-field";
import {
  ACQUISITION_MODELS,
  CONVERSION_UNITS,
  RESEARCH_PROFILES,
} from "@/lib/contracts/types";
import { humanize } from "@/lib/contracts/path";
import { generateProjectBrief } from "@/lib/contracts/brief";
import {
  requiredConditionalQuestions,
  validateIntake,
} from "@/lib/contracts/preflight";
import { useWorkspace } from "@/lib/workspace/store";

const STEPS = [
  "Goal",
  "Market",
  "Business model",
  "Lead consumer",
  "Lead buyer",
  "Lead product",
  "Non-search channels",
  "Brands & sources",
  "Delivery",
  "Review",
] as const;

const acquisitionOptions = ACQUISITION_MODELS.map((value) => ({
  value,
  label: humanize(value),
}));
const conversionOptions = CONVERSION_UNITS.map((value) => ({
  value,
  label: humanize(value),
}));
const profileOptions = RESEARCH_PROFILES.map((value) => ({
  value,
  label: humanize(value),
}));

function StepHeader({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description: string;
}) {
  return (
    <div className="wizard-section-heading">
      <span>{String(step + 1).padStart(2, "0")}</span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

function ConditionalRequirements({
  conversion,
}: {
  conversion: (typeof CONVERSION_UNITS)[number] | "";
}) {
  const { activeProject, updateField } = useWorkspace();
  if (!activeProject) return null;
  const questions = requiredConditionalQuestions(conversion);
  if (questions.length === 0) return null;
  const current =
    activeProject.intake.lead_product.required_fields_or_call_conditions;

  return (
    <fieldset className="conditional-requirements">
      <legend>{humanize(conversion)} definition checks</legend>
      <p>
        Keep each unresolved condition visible. Selecting a check records the
        requirement name; add the actual rule in the field below.
      </p>
      <div>
        {questions.map((question) => (
          <label key={question}>
            <input
              type="checkbox"
              checked={current.includes(question)}
              onChange={(event) =>
                updateField(
                  "lead_product.required_fields_or_call_conditions",
                  event.target.checked
                    ? [...current, question]
                    : current.filter((item) => item !== question),
                  (event.target.checked
                    ? [...current, question]
                    : current.filter((item) => item !== question)
                  ).join(", "),
                )
              }
            />
            <span>{question}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function IntakeWizard() {
  const [step, setStep] = useState(0);
  const { activeProject, setView } = useWorkspace();
  if (!activeProject) return null;

  const intake = activeProject.intake;
  const acquisition = intake.business_model.acquisition_model;
  const conversion = intake.business_model.conversion_unit;
  const internal =
    acquisition === "internal_lead_generation" ||
    intake.business_model.lead_is_for_internal_use;
  const sold =
    intake.business_model.lead_is_sold_or_transferred ||
    [
      "sell_leads",
      "agency_or_client_delivery",
      "marketplace_or_matching",
      "affiliate_or_referral",
      "hybrid",
    ].includes(acquisition);
  const preflight = validateIntake(intake, activeProject.field_states);
  const brief = generateProjectBrief(
    intake,
    activeProject.field_states,
    activeProject.updated_at.slice(0, 10),
  );

  return (
    <div className="wizard-layout">
      <nav className="wizard-steps" aria-label="Intake steps">
        {STEPS.map((label, index) => (
          <button
            type="button"
            key={label}
            onClick={() => setStep(index)}
            className={step === index ? "wizard-step-active" : ""}
            aria-current={step === index ? "step" : undefined}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            {label}
          </button>
        ))}
      </nav>

      <div className="wizard-panel">
        {step === 0 ? (
          <>
            <StepHeader
              step={step}
              title="What decision should the research support?"
              description="Start with the choice that the final intelligence must make easier."
            />
            <div className="question-grid">
              <QuestionField
                path="project.name"
                label="Project name"
                help="A stable name for saving, resuming, and duplicating this brief."
                placeholder="Example: Regional service market scan"
                required
              />
              <QuestionField
                path="project.research_decision"
                label="Research decision"
                help="Name the decision, not a broad topic."
                placeholder="Decide whether…"
                kind="textarea"
                required
              />
              <QuestionField
                path="project.intended_users"
                label="Who will use the research?"
                help="Separate roles with commas."
                kind="list"
                placeholder="Ad strategist, buyer-sales owner"
              />
              <QuestionField
                path="project.research_profile"
                label="Research profile"
                help="Scan proves direction; standard is the decision-grade default; deep changes breadth."
                kind="select"
                options={profileOptions}
                required
              />
              <QuestionField
                path="project.notes"
                label="Working notes"
                help="Keep assumptions and context here; do not paste credentials."
                kind="textarea"
              />
              <QuestionField
                path="project.requested_completion_date"
                label="Requested completion date"
                help="Optional planning date; it does not authorize a deadline commitment."
                kind="date"
              />
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <StepHeader
              step={step}
              title="Define the research population"
              description="Geography, language, and category determine which evidence is actually relevant."
            />
            <div className="question-grid">
              <QuestionField
                path="market.offer_type"
                label="Offer type"
                help="What will the end customer be invited to request or do?"
                placeholder="Information request, quote, booking…"
              />
              <QuestionField
                path="market.industry"
                label="Industry"
                help="Use the category people and organizations recognize."
                required
              />
              <QuestionField
                path="market.subcategory"
                label="Subcategory"
                help="Narrow the population when the industry is broad."
              />
              <QuestionField
                path="market.problem_category"
                label="Problem category"
                help="The underlying problem may be clearer than an industry label."
              />
              <QuestionField
                path="market.countries"
                label="Countries"
                help="List explicit countries; do not assume a default market."
                kind="list"
                required
              />
              <QuestionField
                path="market.regions"
                label="Target regions"
                help="States, provinces, metros, or an explicit nationwide scope."
                kind="list"
              />
              <QuestionField
                path="market.geography_notes"
                label="Geography notes"
                help="Capture service-radius, exclusions, or global scope."
              />
              <QuestionField
                path="market.languages"
                label="Languages"
                help="The languages research and final documents must cover."
                kind="list"
                required
              />
              <QuestionField
                path="market.time_window"
                label="Time window"
                help="Use current unless the decision needs a historical comparison."
              />
              <QuestionField
                path="market.known_seasonality"
                label="Known seasonality"
                help="Mark research this when seasonality is an open question."
              />
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <StepHeader
              step={step}
              title="Describe how the lead creates value"
              description="The same consumer inquiry means different things in an internal, sold, client, or marketplace model."
            />
            <div className="question-grid">
              <QuestionField
                path="business_model.acquisition_model"
                label="Acquisition model"
                help="This controls buyer, delivery, and commercial questions."
                kind="select"
                options={acquisitionOptions}
                required
              />
              <QuestionField
                path="business_model.conversion_unit"
                label="Conversion unit"
                help="Define the event the research and funnel must produce."
                kind="select"
                options={conversionOptions}
                required
              />
              <CheckField
                path="business_model.lead_is_for_internal_use"
                label="The operating business uses its own leads"
                help="The same organization generates and receives the inquiry."
              />
              <CheckField
                path="business_model.lead_is_sold_or_transferred"
                label="The lead is sold, transferred, or delivered"
                help="Buyer acceptance and source permissions remain explicit gates."
              />
              <QuestionField
                path="business_model.underlying_service_or_product"
                label="Underlying service or product"
                help="What ultimately fulfills the end customer’s need?"
              />
              <QuestionField
                path="business_model.known_value_chain"
                label="Known value chain"
                help="Name collectors, buyers, providers, and intermediaries without merging them."
                kind="textarea"
              />
              <QuestionField
                path="business_model.success_definition"
                label="Success definition"
                help="What should be true when this research is useful?"
                kind="textarea"
              />
            </div>
            {internal ? (
              <div className="conditional-callout">
                Internal model selected: contract-sale fields remain optional, but
                capacity, intake, customer value, and acceptance still belong to
                the buyer side.
              </div>
            ) : null}
          </>
        ) : null}

        {step === 3 ? (
          <>
            <StepHeader
              step={step}
              title="Define the end-customer audience"
              description="Use situation, triggers, qualification, and trust—not ornamental persona details."
            />
            <div className="question-grid">
              <QuestionField
                path="b2c_lead_consumers.segment_definition"
                label="Lead audience"
                help="Who experiences the underlying problem and may become the lead?"
                kind="textarea"
                required
              />
              <QuestionField
                path="b2c_lead_consumers.demographic_or_firmographic_boundaries"
                label="Material boundaries"
                help="Include only boundaries that change eligibility, messaging, or the experience."
                kind="list"
              />
              <QuestionField
                path="b2c_lead_consumers.situational_boundaries"
                label="Situational boundaries"
                help="Describe the circumstances that define this audience."
                kind="list"
              />
              <QuestionField
                path="b2c_lead_consumers.trigger_events"
                label="Trigger events"
                help="Mark research this when these should be discovered from evidence."
                kind="textarea"
              />
              <QuestionField
                path="b2c_lead_consumers.desired_outcomes"
                label="Desired outcomes"
                help="Keep supplied knowledge separate from research hypotheses."
                kind="textarea"
              />
              <QuestionField
                path="b2c_lead_consumers.known_objections"
                label="Known objections"
                help="Use attributable knowledge or mark research this."
                kind="textarea"
              />
              <QuestionField
                path="b2c_lead_consumers.trust_requirements"
                label="Trust requirements"
                help="Privacy, proof, identity, accessibility, or other decision needs."
                kind="textarea"
              />
              <QuestionField
                path="b2c_lead_consumers.known_awareness_stage"
                label="Known awareness stage"
                help="Use known evidence or mark this for research."
                kind="textarea"
              />
              <QuestionField
                path="b2c_lead_consumers.decision_roles_or_gatekeepers"
                label="Decision roles or gatekeepers"
                help="Other people or institutions that materially affect the choice."
                kind="textarea"
              />
              <QuestionField
                path="b2c_lead_consumers.qualification_conditions"
                label="Qualification"
                help="Facts that make an inquiry eligible."
                kind="list"
              />
              <QuestionField
                path="b2c_lead_consumers.disqualification_conditions"
                label="Disqualification"
                help="Facts that make an inquiry ineligible."
                kind="list"
              />
              <QuestionField
                path="b2c_lead_consumers.accessibility_or_language_needs"
                label="Accessibility or language needs"
                help="Known experience requirements; do not infer protected characteristics."
                kind="list"
              />
              <QuestionField
                path="b2c_lead_consumers.consumer_exclusions"
                label="Audience exclusions"
                help="Populations intentionally outside the research."
                kind="list"
              />
            </div>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <StepHeader
              step={step}
              title={internal ? "Define the internal lead buyer" : "Define the lead buyer"}
              description="Buyer needs, economics, intake, proof, and acceptance are a separate demand system."
            />
            <div className="question-grid">
              <QuestionField
                path="b2b_lead_buyers.buyer_relationship"
                label="Buyer relationship"
                help="Internal operator, end buyer, agency, network, marketplace, or other relationship."
                required
              />
              <QuestionField
                path="b2b_lead_buyers.organization_types"
                label="Organization types"
                help="Which organizations receive or pay for the lead?"
                kind="list"
                required={!internal}
              />
              <QuestionField
                path="b2b_lead_buyers.decision_maker_roles"
                label="Decision-maker roles"
                help="Who evaluates sources, terms, quality, and risk?"
                kind="list"
              />
              <QuestionField
                path="b2b_lead_buyers.service_areas"
                label="Buyer service areas"
                help="Where can buyers actually fulfill demand?"
                kind="list"
              />
              <QuestionField
                path="b2b_lead_buyers.company_size_or_maturity"
                label="Company size or maturity"
                help="Only boundaries that change capacity, buying process, or fit."
                kind="list"
              />
              <QuestionField
                path="b2b_lead_buyers.capacity_and_hours"
                label="Capacity and hours"
                help="Unknown capacity remains visible; it is not a reason to invent volume."
              />
              <QuestionField
                path="b2b_lead_buyers.intake_workflow"
                label="Intake workflow"
                help="How leads are received, worked, qualified, and dispositioned."
                kind="textarea"
              />
              <QuestionField
                path="b2b_lead_buyers.crm_or_routing_systems"
                label="CRM or routing systems"
                help="Known systems only; credentials never belong here."
                kind="list"
              />
              <QuestionField
                path="b2b_lead_buyers.desired_volume"
                label="Desired volume"
                help="Capture a known range or leave it as a research question."
              />
              <QuestionField
                path="b2b_lead_buyers.delivery_preferences"
                label="Delivery preferences"
                help="Known channels or formats for receiving leads."
                kind="list"
              />
              <QuestionField
                path="b2b_lead_buyers.speed_to_lead_expectation"
                label="Speed-to-lead expectation"
                help="Capture a verified expectation or keep it unknown."
              />
              <QuestionField
                path="b2b_lead_buyers.lead_quality_definition"
                label="Lead quality definition"
                help="What makes a lead good, bad, invalid, duplicate, or non-payable?"
                kind="textarea"
              />
              <QuestionField
                path="b2b_lead_buyers.proof_required"
                label="Proof required"
                help="Reporting, recordings, outcomes, controls, or other adoption evidence."
                kind="textarea"
              />
              <QuestionField
                path="b2b_lead_buyers.common_objections"
                label="Common buyer objections"
                help="Use attributable input or mark it for research."
                kind="textarea"
              />
              <QuestionField
                path="b2b_lead_buyers.vendor_or_channel_history"
                label="Vendor or channel history"
                help="Known experience with lead sources, vendors, or acquisition channels."
                kind="textarea"
              />
              <QuestionField
                path="b2b_lead_buyers.commercial_constraints"
                label="Commercial constraints"
                help="Unknown pricing or economics remains a launch gate, not a research blocker."
                kind="textarea"
              />
              <QuestionField
                path="b2b_lead_buyers.source_permissions"
                label="Source permissions"
                help="Which platforms and methods can the buyer accept?"
                kind="textarea"
              />
              <QuestionField
                path="b2b_lead_buyers.buyer_exclusions"
                label="Buyer exclusions"
                help="Buyer types intentionally outside the research."
                kind="list"
              />
            </div>
            {sold ? (
              <div className="conditional-callout conditional-callout-gate">
                Sold or delivered leads selected: source permission, acceptance,
                delivery, economics, and quality feedback will stay visible as
                launch gates until verified.
              </div>
            ) : null}
          </>
        ) : null}

        {step === 5 ? (
          <>
            <StepHeader
              step={step}
              title="Specify the lead product"
              description="This is the operational contract joining consumer acquisition to buyer value."
            />
            <div className="question-grid">
              <QuestionField
                path="lead_product.conversion_definition"
                label="Exact conversion definition"
                help={`What specifically creates the ${conversion || "selected conversion"}?`}
                kind="textarea"
              />
              <QuestionField
                path="lead_product.payable_or_accepted_event"
                label="Accepted or payable event"
                help="Use not applicable for an internal event when appropriate."
              />
              <QuestionField
                path="lead_product.required_fields_or_call_conditions"
                label="Required fields or conditions"
                help={
                  ["inbound_call", "qualified_call", "live_transfer"].includes(
                    conversion,
                  )
                    ? "Include duration, connection, recording, and transfer conditions."
                    : conversion === "appointment"
                      ? "Include booking, attendance, reschedule, and no-show conditions."
                      : conversion === "application"
                        ? "Include completion, eligibility, and required application fields."
                        : "List only data or conditions necessary for acceptance and follow-up."
                }
                kind="list"
              />
              <ConditionalRequirements conversion={conversion} />
              <QuestionField
                path="lead_product.geography"
                label="Lead-product geography"
                help="Where can this exact lead be created and accepted?"
                kind="list"
              />
              <QuestionField
                path="lead_product.operating_hours"
                label="Operating hours"
                help="Separate creation, delivery, acceptance, and fulfillment hours when needed."
              />
              <QuestionField
                path="lead_product.consent_and_disclosure_requirements"
                label="Consent and disclosure"
                help="Do not invent reviewed language; capture known requirements or research this."
                kind="textarea"
              />
              <QuestionField
                path="lead_product.delivery_method"
                label="Delivery method"
                help="Internal notification, API, webhook, email, call transfer, CRM, or another verified route."
              />
              <QuestionField
                path="lead_product.delivery_latency"
                label="Delivery latency"
                help="How quickly must the lead reach the buyer?"
              />
              {sold ? (
                <QuestionField
                  path="lead_product.exclusivity"
                  label="Exclusivity"
                  help="Exclusive, shared, aged, recycled, or unknown."
                />
              ) : null}
              <QuestionField
                path="lead_product.duplicate_policy"
                label="Duplicate policy"
                help="Window, identifiers, and treatment of duplicates."
                kind="textarea"
              />
              {sold ? (
                <QuestionField
                  path="lead_product.return_or_replacement_policy"
                  label="Returns or replacements"
                  help="Known rules, not proposed terms presented as fact."
                  kind="textarea"
                />
              ) : null}
              <QuestionField
                path="lead_product.quality_feedback_loop"
                label="Quality feedback"
                help="How contact, qualification, appointment, sale, and reason codes return."
                kind="textarea"
              />
              <QuestionField
                path="lead_product.tracking_and_attribution"
                label="Tracking and attribution"
                help="IDs, events, windows, recordings, and reconciliation."
                kind="textarea"
              />
              {sold ? (
                <QuestionField
                  path="lead_product.buyer_value_or_payout"
                  label="Buyer value or payout"
                  help="Unknown economics remains a gate."
                />
              ) : null}
              <QuestionField
                path="lead_product.target_acquisition_ceiling"
                label="Acquisition ceiling"
                help="Do not infer from example-market economics."
              />
              <QuestionField
                path="lead_product.allowed_sources"
                label="Allowed sources"
                help="Current verified permissions or research this."
                kind="textarea"
              />
              <QuestionField
                path="lead_product.prohibited_sources_or_claims"
                label="Prohibited sources or claims"
                help="Capture buyer, platform, legal, and reputation constraints without making legal conclusions."
                kind="textarea"
              />
            </div>
          </>
        ) : null}

        {step === 6 ? (
          <>
            <StepHeader
              step={step}
              title="Set the non-search channel boundary"
              description="The research engine will distinguish observable evidence from unavailable surfaces."
            />
            <div className="question-grid">
              <QuestionField
                path="channels.priority_non_search_platforms"
                label="Priority non-search platforms"
                help="List only known priorities; otherwise allow the system to recommend them."
                kind="list"
              />
              <QuestionField
                path="channels.excluded_platforms"
                label="Excluded platforms"
                help="Name explicit channel and platform exclusions."
                kind="list"
              />
              <QuestionField
                path="channels.known_accounts_or_advertisers"
                label="Known accounts or advertisers"
                help="Seeds only; they are not evidence until resolved."
                kind="list"
              />
              <CheckField
                path="channels.recommend_platforms"
                label="Allow the research engine to recommend platforms"
                help="Recommendations remain evidence-bound and can still mark a surface unobservable."
              />
              <CheckField
                path="channels.include_search_comparison"
                label="Include a bounded Search comparison"
                help="Search stays excluded unless this is deliberately selected."
              />
            </div>
          </>
        ) : null}

        {step === 7 ? (
          <>
            <StepHeader
              step={step}
              title="Keep brand roles and source roles separate"
              description="A publisher, buyer-facing offer, and consumer-facing identity are not interchangeable."
            />
            <div className="question-grid">
              <QuestionField
                path="brands.research_publisher.name"
                label="Research publisher"
                help="The identity that owns the intelligence documents."
              />
              <QuestionField
                path="brands.buyer_facing_brand.name"
                label="Buyer-facing brand"
                help="The identity or offer presented to lead buyers."
              />
              <QuestionField
                path="brands.consumer_facing_brand.name"
                label="Consumer-facing brand"
                help="The identity collecting or guiding the inquiry."
              />
              <QuestionField
                path="brands.research_publisher.brand_profile_path_or_url"
                label="Publisher brand profile"
                help="A reference path or URL; never include credentials."
              />
              <QuestionField
                path="brands.research_publisher.google_doc_template_url"
                label="Google Doc template"
                help="Assign its exact role in the source workspace before publication."
              />
              <QuestionField
                path="brands.research_publisher.assets"
                label="Publisher asset references"
                help="Paths or public URLs only; register factual source material separately."
                kind="list"
              />
              <QuestionField
                path="brands.buyer_facing_brand.brand_profile_path_or_url"
                label="Buyer brand profile"
                help="Optional path or public URL for buyer-facing treatment."
              />
              <QuestionField
                path="brands.buyer_facing_brand.assets"
                label="Buyer brand asset references"
                help="Paths or public URLs only."
                kind="list"
              />
              <QuestionField
                path="brands.consumer_facing_brand.brand_profile_path_or_url"
                label="Consumer brand profile"
                help="Optional path or public URL for consumer-facing treatment."
              />
              <QuestionField
                path="brands.consumer_facing_brand.assets"
                label="Consumer brand asset references"
                help="Paths or public URLs only."
                kind="list"
              />
              <CheckField
                path="brands.allow_provisional_document_styling"
                label="Allow restrained provisional document styling"
                help="No invented logo, endorsement, certification, testimonial, or approved claim."
              />
            </div>
            <div className="source-handoff-card">
              <div>
                <p className="eyebrow">Source workspace</p>
                <h3>
                  {intake.sources.attachments.length + intake.sources.urls.length}{" "}
                  registered source
                  {intake.sources.attachments.length + intake.sources.urls.length ===
                  1
                    ? ""
                    : "s"}
                </h3>
                <p>
                  Detected type, role, status, and notes are reviewed separately
                  from the filename.
                </p>
              </div>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setView("sources")}
              >
                Open sources
              </button>
            </div>
            <div className="question-grid">
              <QuestionField
                path="sources.first_party_interviews"
                label="First-party interview references"
                help="Names or local references only; register inspectable files in Sources."
                kind="list"
              />
              <QuestionField
                path="sources.call_transcripts"
                label="Call transcript references"
                help="References only; do not paste credentials or sensitive raw records."
                kind="list"
              />
              <QuestionField
                path="sources.buyer_feedback_or_disposition_data"
                label="Buyer feedback or disposition references"
                help="References to authorized first-party evidence."
                kind="list"
              />
              <QuestionField
                path="sources.prior_research"
                label="Prior research references"
                help="Keep past/example material role-labeled and factually isolated."
                kind="list"
              />
              <QuestionField
                path="sources.source_role_notes"
                label="Source role notes"
                help="Document any handling rule that applies across the source inventory."
                kind="list"
              />
            </div>
          </>
        ) : null}

        {step === 8 ? (
          <>
            <StepHeader
              step={step}
              title="Choose the delivery contract"
              description="Markdown remains durable. Native Google Docs require creation, readback, access checks, and parity verification."
            />
            <div className="question-grid">
              <CheckField
                path="delivery.create_section_markdown"
                label="Create numbered section Markdown"
                help="Ten section files for a standard or deep full package."
              />
              <CheckField
                path="delivery.create_section_google_docs"
                label="Create native section Google Docs"
                help="Each applicable section requires a verified native counterpart."
              />
              <CheckField
                path="delivery.create_master_markdown"
                label="Create synthesized master Markdown"
                help="The master reconciles the sections; it does not concatenate them."
              />
              <CheckField
                path="delivery.create_master_google_doc"
                label="Create a synthesized master Google Doc"
                help="Publication remains partial until native readback and access verification."
              />
              <QuestionField
                path="delivery.local_output_root"
                label="Requested local output root"
                help="Runtime output is kept outside synced Documents unless an authorized project path is chosen."
              />
              <QuestionField
                path="delivery.google_drive_folder_url"
                label="Google Drive folder"
                help="Owner-only by default; sharing is never broadened implicitly."
              />
              <QuestionField
                path="delivery.sharing_instruction"
                label="Sharing instruction"
                help="Owner-only is the default."
              />
              <QuestionField
                path="delivery.reviewers"
                label="Reviewers"
                help="Names or roles only; do not use this field to change access."
                kind="list"
              />
              <QuestionField
                path="delivery.additional_formats"
                label="Additional formats"
                help="Optional formats beyond Markdown and native Google Docs."
                kind="list"
              />
            </div>
            <div className="wizard-section-heading wizard-subsection-heading">
              <span>C</span>
              <div>
                <h2>Research constraints and approvals</h2>
                <p>
                  These fields scope research. Recording an action does not make
                  the bounded MVP executor capable of performing it.
                </p>
              </div>
            </div>
            <div className="question-grid">
              <QuestionField
                path="constraints.budget_for_paid_data"
                label="Paid-data budget"
                help="Numeric planning ceiling only; the MVP never purchases data."
                kind="number"
              />
              <QuestionField
                path="constraints.data_or_source_restrictions"
                label="Data or source restrictions"
                help="Sources, methods, or data that must not be used."
                kind="list"
              />
              <QuestionField
                path="constraints.compliance_or_reputation_concerns"
                label="Compliance or reputation concerns"
                help="Risks to investigate; this does not produce legal conclusions."
                kind="list"
              />
              <QuestionField
                path="constraints.competitors_to_include"
                label="Competitors to include"
                help="Seeds only; identity and evidence still require verification."
                kind="list"
              />
              <QuestionField
                path="constraints.competitors_to_exclude"
                label="Competitors to exclude"
                help="Explicit competitor exclusions."
                kind="list"
              />
              <QuestionField
                path="constraints.external_actions_allowed"
                label="External-action allowlist"
                help="Defaults empty. The MVP local executor rejects every non-empty allowlist."
                kind="list"
              />
              <QuestionField
                path="constraints.additional_exclusions"
                label="Additional exclusions"
                help="Anything else outside the research or deliverable scope."
                kind="list"
              />
            </div>
          </>
        ) : null}

        {step === 9 ? (
          <>
            <StepHeader
              step={step}
              title="Review the normalized brief"
              description="Required gaps stop a run. Commercial and operational unknowns remain visible launch gates."
            />
            <div className="review-summary">
              <div className={preflight.passed ? "review-pass" : "review-blocked"}>
                <span>{preflight.passed ? "Minimum brief passed" : "Brief needs correction"}</span>
                <strong>
                  {preflight.passed
                    ? `${preflight.research_unknowns.length} research unknowns; ${preflight.launch_gates.length} launch gates`
                    : `${preflight.issues.length} required field${preflight.issues.length === 1 ? "" : "s"} missing`}
                </strong>
              </div>
              {preflight.issues.length ? (
                <ul className="issue-list">
                  {preflight.issues.map((issue) => (
                    <li key={issue.path}>
                      <code>{issue.path}</code>
                      <span>{issue.message}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <details className="brief-preview" open>
              <summary>00-project-brief.md preview</summary>
              <pre>{brief}</pre>
            </details>
            <div className="review-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setView("preflight")}
              >
                Open full preflight
              </button>
              <button
                type="button"
                className="button button-primary"
                disabled={!preflight.passed}
                onClick={() => setView("run")}
              >
                Continue to run workspace
              </button>
            </div>
          </>
        ) : null}

        <div className="wizard-controls">
          <button
            type="button"
            className="button button-quiet"
            disabled={step === 0}
            onClick={() => setStep((current) => Math.max(0, current - 1))}
          >
            Previous
          </button>
          <span>
            Step {step + 1} of {STEPS.length}
          </span>
          <button
            type="button"
            className="button button-secondary"
            disabled={step === STEPS.length - 1}
            onClick={() =>
              setStep((current) => Math.min(STEPS.length - 1, current + 1))
            }
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
