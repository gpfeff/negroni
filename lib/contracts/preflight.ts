import {
  ACQUISITION_MODELS,
  CONVERSION_UNITS,
  RESEARCH_PROFILES,
  type CanonicalIntake,
  type FieldStateMap,
  type PreflightResult,
  type ValidationIssue,
} from "./types";
import { createDocumentContract } from "./defaults";

const RESEARCH_SENTINELS = new Set(["unknown", "research_this"]);
const REQUIRED_SENTINELS = new Set([
  "unknown",
  "research_this",
  "not_applicable",
]);
const GATE_FIELDS: Array<[string, string]> = [
  [
    "b2b_lead_buyers.commercial_constraints",
    "Commercial terms and buyer economics",
  ],
  ["b2b_lead_buyers.source_permissions", "Buyer source permissions"],
  [
    "lead_product.consent_and_disclosure_requirements",
    "Consent, disclosure, and contact requirements",
  ],
  ["lead_product.delivery_method", "Lead delivery and routing"],
  ["lead_product.tracking_and_attribution", "Tracking and attribution"],
  ["lead_product.payable_or_accepted_event", "Buyer acceptance or payable event"],
  ["lead_product.allowed_sources", "Allowed traffic sources"],
  ["lead_product.buyer_value_or_payout", "Buyer value or payout"],
  ["lead_product.target_acquisition_ceiling", "Acquisition ceiling"],
];

function isBlank(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) &&
      (value.length === 0 || value.every((item) => isBlank(item))))
  );
}

function isUnresolvedState(state?: FieldStateMap[string]): boolean {
  return (
    state !== undefined &&
    ["blank", "unknown", "research_this", "not_applicable"].includes(state)
  );
}

function isResolvedRequired(value: unknown, state?: FieldStateMap[string]): boolean {
  return !(
    isBlank(value) ||
    (typeof value === "string" && REQUIRED_SENTINELS.has(value)) ||
    isUnresolvedState(state)
  );
}

function collectLiteralResearchUnknowns(
  value: unknown,
  path = "",
  result: string[] = [],
): string[] {
  if (typeof value === "string" && RESEARCH_SENTINELS.has(value)) {
    result.push(`${path}: ${value.replace("_", " ")}`);
    return result;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      collectLiteralResearchUnknowns(entry, `${path}[${index}]`, result),
    );
    return result;
  }
  if (value && typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) =>
      collectLiteralResearchUnknowns(child, path ? `${path}.${key}` : key, result),
    );
  }
  return result;
}

function valueAt(intake: CanonicalIntake, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value && typeof value === "object") {
      return (value as Record<string, unknown>)[key];
    }
    return undefined;
  }, intake);
}

function addRequired(
  issues: ValidationIssue[],
  path: string,
  value: unknown,
  message: string,
  fieldStates: FieldStateMap,
) {
  if (!isResolvedRequired(value, fieldStates[path])) {
    issues.push({ path, message });
  }
}

const CONDITIONAL_MATCHERS: Record<string, RegExp> = {
  "Call duration": /\b(duration|seconds?|minutes?)\b/i,
  "Recording and consent":
    /\b(recording|recorded)\b.*\bconsent\b|\bconsent\b.*\b(recording|recorded)\b/i,
  "Connected-call conditions": /\b(connect(?:ed|ion)?|answered)\b/i,
  "Warm-transfer acceptance":
    /\btransfer\b.*\baccept|\baccept.*\btransfer\b/i,
  "Buyer connection conditions":
    /\bbuyer\b.*\bconnect|\bconnect.*\bbuyer\b/i,
  "Booking confirmation":
    /\bbook(?:ing|ed)?\b.*\bconfirm|\bconfirm.*\bbook/i,
  "Attendance definition": /\battend(?:ance|ed|ing)?\b/i,
  "Reschedule and no-show rules": /\breschedul|\bno[- ]?show\b/i,
  "Application completion":
    /\bapplication\b.*\bcomplet|\bcomplet.*\bapplication\b/i,
  "Eligibility conditions": /\beligib/i,
  "Required application fields":
    /\b(required|mandatory)\b.*\bfields?\b|\bapplication fields?\b/i,
  "Activation definition": /\bactivat/i,
  "Attendance or usage threshold": /\b(attend|usage|threshold)\b/i,
  "Custom event definition": /\bcustom\b.*\bevent\b|\bevent\b.*\bcustom\b/i,
  "Acceptance proof": /\baccept.*\bproof|\bproof.*\baccept/i,
};

function conditionIsRepresented(question: string, values: string[]): boolean {
  const matcher = CONDITIONAL_MATCHERS[question];
  return matcher ? values.some((value) => matcher.test(value)) : false;
}

export function requiredConditionalQuestions(
  conversionUnit: CanonicalIntake["business_model"]["conversion_unit"],
): string[] {
  if (["inbound_call", "qualified_call"].includes(conversionUnit)) {
    return ["Call duration", "Recording and consent", "Connected-call conditions"];
  }
  if (conversionUnit === "live_transfer") {
    return [
      "Call duration",
      "Warm-transfer acceptance",
      "Recording and consent",
      "Buyer connection conditions",
    ];
  }
  if (conversionUnit === "appointment") {
    return [
      "Booking confirmation",
      "Attendance definition",
      "Reschedule and no-show rules",
    ];
  }
  if (conversionUnit === "application") {
    return [
      "Application completion",
      "Eligibility conditions",
      "Required application fields",
    ];
  }
  if (conversionUnit === "trial_or_demo") {
    return ["Activation definition", "Attendance or usage threshold"];
  }
  if (conversionUnit === "custom_event") {
    return ["Custom event definition", "Acceptance proof"];
  }
  return [];
}

export function validateIntake(
  intake: CanonicalIntake,
  fieldStates: FieldStateMap = {},
): PreflightResult {
  const issues: ValidationIssue[] = [];
  const researchUnknowns: string[] = [];
  const launchGates: string[] = [];

  if (intake.schema_version !== "1.0") {
    issues.push({
      path: "schema_version",
      message: "Schema version must be 1.0.",
    });
  }

  addRequired(
    issues,
    "project.name",
    intake.project.name,
    "Name the saved project.",
    fieldStates,
  );
  addRequired(
    issues,
    "project.research_decision",
    intake.project.research_decision,
    "State the decision this research must support.",
    fieldStates,
  );
  if (!RESEARCH_PROFILES.includes(intake.project.research_profile)) {
    issues.push({
      path: "project.research_profile",
      message: "Choose scan, standard, deep, or refresh.",
    });
  }
  if (
    !isResolvedRequired(
      intake.market.industry,
      fieldStates["market.industry"],
    ) &&
    !isResolvedRequired(
      intake.market.problem_category,
      fieldStates["market.problem_category"],
    )
  ) {
    issues.push({
      path: "market.industry",
      message: "Define an industry or problem category.",
    });
  }
  if (
    !isResolvedRequired(
      intake.market.countries,
      fieldStates["market.countries"],
    ) &&
    !isResolvedRequired(
      intake.market.regions,
      fieldStates["market.regions"],
    ) &&
    !isResolvedRequired(
      intake.market.geography_notes,
      fieldStates["market.geography_notes"],
    )
  ) {
    issues.push({
      path: "market.countries",
      message: "Add a country, target region, or explicit global scope.",
    });
  }
  addRequired(
    issues,
    "market.languages",
    intake.market.languages,
    "Add at least one research language.",
    fieldStates,
  );
  if (!ACQUISITION_MODELS.includes(intake.business_model.acquisition_model as never)) {
    issues.push({
      path: "business_model.acquisition_model",
      message: "Choose an acquisition model.",
    });
  }
  if (!CONVERSION_UNITS.includes(intake.business_model.conversion_unit as never)) {
    issues.push({
      path: "business_model.conversion_unit",
      message: "Choose a conversion unit.",
    });
  }
  addRequired(
    issues,
    "b2c_lead_consumers.segment_definition",
    intake.b2c_lead_consumers.segment_definition,
    "Define the end-customer or lead audience.",
    fieldStates,
  );

  const externallyDeliveredModel = [
    "sell_leads",
    "agency_or_client_delivery",
    "marketplace_or_matching",
    "affiliate_or_referral",
    "hybrid",
  ].includes(intake.business_model.acquisition_model);
  const requiresExternalBuyer =
    externallyDeliveredModel ||
    intake.business_model.lead_is_sold_or_transferred;
  if (requiresExternalBuyer) {
    addRequired(
      issues,
      "b2b_lead_buyers.organization_types",
      intake.b2b_lead_buyers.organization_types,
      "Define the organizations that buy or receive leads.",
      fieldStates,
    );
  } else if (
    !isResolvedRequired(
      intake.b2b_lead_buyers.buyer_relationship,
      fieldStates["b2b_lead_buyers.buyer_relationship"],
    )
  ) {
    issues.push({
      path: "b2b_lead_buyers.buyer_relationship",
      message: "Confirm that the operating business is the internal lead buyer.",
    });
  }

  if (
    intake.channels.priority_non_search_platforms.length === 0 &&
    !intake.channels.recommend_platforms
  ) {
    issues.push({
      path: "channels.priority_non_search_platforms",
      message: "Choose priority platforms or allow platform recommendations.",
    });
  }
  if (
    (isBlank(intake.brands.research_publisher.name) ||
      REQUIRED_SENTINELS.has(intake.brands.research_publisher.name) ||
      ["blank", "unknown", "research_this", "not_applicable"].includes(
        fieldStates["brands.research_publisher.name"],
      )) &&
    !intake.brands.allow_provisional_document_styling
  ) {
    issues.push({
      path: "brands.research_publisher.name",
      message: "Name the research publisher or allow provisional styling.",
    });
  }

  if (
    intake.business_model.acquisition_model === "internal_lead_generation" &&
    intake.business_model.lead_is_sold_or_transferred
  ) {
    issues.push({
      path: "business_model.lead_is_sold_or_transferred",
      message:
        "Internal lead generation conflicts with sold or transferred leads. Choose hybrid if both are true.",
    });
  }
  if (
    intake.business_model.acquisition_model !== "hybrid" &&
    externallyDeliveredModel &&
    intake.business_model.lead_is_for_internal_use
  ) {
    issues.push({
      path: "business_model.lead_is_for_internal_use",
      message:
        "This external delivery model conflicts with internal-only use. Choose hybrid if both are true.",
    });
  }

  const templateUrl = intake.brands.research_publisher.google_doc_template_url;
  if (templateUrl) {
    const registeredTemplate = [
      ...intake.sources.attachments,
      ...intake.sources.urls,
    ].some(
      (source) =>
        ["template", "adaptable_reference"].includes(source.role) &&
        ["exact_template", "adaptable_template"].includes(
          source.template_treatment,
        ) &&
        (source.url === templateUrl || source.name === templateUrl),
    );
    if (!registeredTemplate) {
      issues.push({
        path: "brands.research_publisher.google_doc_template_url",
        message:
          "Register the supplied Google Doc template in Sources with a template or adaptable-reference role.",
      });
    }
  }

  const requiredQuestions = requiredConditionalQuestions(
    intake.business_model.conversion_unit,
  );
  if (requiredQuestions.length > 0) {
    const current = intake.lead_product.required_fields_or_call_conditions.map(
      (item) => item.toLowerCase(),
    );
    requiredQuestions.forEach((question) => {
      if (!conditionIsRepresented(question, current)) {
        researchUnknowns.push(`${question} (${intake.business_model.conversion_unit})`);
      }
    });
  }

  Object.entries(fieldStates).forEach(([path, state]) => {
    if (state === "unknown" || state === "research_this") {
      researchUnknowns.push(`${path}: ${state.replace("_", " ")}`);
    }
  });
  researchUnknowns.push(...collectLiteralResearchUnknowns(intake));

  GATE_FIELDS.forEach(([path, label]) => {
    const value = valueAt(intake, path);
    const state = fieldStates[path];
    if (
      state === "unknown" ||
      state === "research_this" ||
      (typeof value === "string" && RESEARCH_SENTINELS.has(value)) ||
      isBlank(value)
    ) {
      launchGates.push(label);
    }
  });

  if (
    intake.business_model.lead_is_sold_or_transferred ||
    [
      "sell_leads",
      "agency_or_client_delivery",
      "marketplace_or_matching",
      "affiliate_or_referral",
      "hybrid",
    ].includes(intake.business_model.acquisition_model)
  ) {
    [
      ["b2b_lead_buyers.source_permissions", "Sold-lead source permission"],
      ["lead_product.delivery_method", "Sold-lead delivery"],
      ["lead_product.payable_or_accepted_event", "Lead acceptance terms"],
      ["lead_product.quality_feedback_loop", "Buyer quality feedback"],
    ].forEach(([path, label]) => {
      const value = valueAt(intake, path);
      if (
        isBlank(value) ||
        (typeof value === "string" && RESEARCH_SENTINELS.has(value))
      ) {
        launchGates.push(label);
      }
    });
  }

  return {
    passed: issues.length === 0,
    issues,
    research_unknowns: [...new Set(researchUnknowns)].sort(),
    launch_gates: [...new Set(launchGates)].sort(),
    proposed_platforms:
      intake.channels.priority_non_search_platforms.length > 0
        ? intake.channels.priority_non_search_platforms
        : ["Research engine to recommend from observable non-search channels"],
    excluded_platforms: intake.channels.excluded_platforms,
    expected_outputs: createDocumentContract(),
    external_actions_allowed: intake.constraints.external_actions_allowed,
  };
}
