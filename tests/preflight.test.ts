import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyIntake, SECTION_CONTRACT } from "@/lib/contracts/defaults";
import {
  requiredConditionalQuestions,
  validateIntake,
} from "@/lib/contracts/preflight";
import type { ConversionUnit } from "@/lib/contracts/types";
import { readyInternalIntake } from "./helpers";

test("empty intake fails the minimum viable brief", () => {
  const result = validateIntake(createEmptyIntake(), {
    "b2b_lead_buyers.buyer_relationship": "blank",
  });
  assert.equal(result.passed, false);
  const paths = new Set(result.issues.map((issue) => issue.path));
  [
    "project.name",
    "project.research_decision",
    "market.industry",
    "market.countries",
    "market.languages",
    "business_model.acquisition_model",
    "business_model.conversion_unit",
    "b2c_lead_consumers.segment_definition",
  ].forEach((path) => assert.ok(paths.has(path), `missing issue for ${path}`));
});

test("minimal internal intake passes only with an explicit internal buyer", () => {
  const intake = readyInternalIntake();
  assert.equal(validateIntake(intake).passed, true);

  intake.b2b_lead_buyers.buyer_relationship = "unknown";
  assert.ok(
    validateIntake(intake).issues.some(
      (issue) => issue.path === "b2b_lead_buyers.buyer_relationship",
    ),
  );
});

test("required sentinel states and whitespace-only geography do not pass", () => {
  const intake = readyInternalIntake();
  intake.project.name = "unknown";
  intake.market.countries = ["   "];
  intake.market.regions = [];
  intake.market.geography_notes = "research_this";
  const result = validateIntake(intake, {
    "project.name": "unknown",
    "market.geography_notes": "research_this",
  });
  assert.ok(result.issues.some((issue) => issue.path === "project.name"));
  assert.ok(result.issues.some((issue) => issue.path === "market.countries"));
});

test("sold and client-delivery models require an external buyer definition", () => {
  for (const acquisition of [
    "sell_leads",
    "agency_or_client_delivery",
    "marketplace_or_matching",
    "affiliate_or_referral",
    "hybrid",
  ] as const) {
    const intake = readyInternalIntake();
    intake.business_model.acquisition_model = acquisition;
    intake.business_model.lead_is_for_internal_use = false;
    intake.business_model.lead_is_sold_or_transferred = true;
    intake.b2b_lead_buyers.organization_types = [];
    assert.ok(
      validateIntake(intake).issues.some(
        (issue) => issue.path === "b2b_lead_buyers.organization_types",
      ),
      acquisition,
    );
  }
});

test("conflicting internal and external flags are blocked", () => {
  const internal = readyInternalIntake();
  internal.business_model.lead_is_sold_or_transferred = true;
  assert.ok(
    validateIntake(internal).issues.some(
      (issue) =>
        issue.path === "business_model.lead_is_sold_or_transferred",
    ),
  );

  const sold = readyInternalIntake();
  sold.business_model.acquisition_model = "sell_leads";
  sold.business_model.lead_is_for_internal_use = true;
  sold.b2b_lead_buyers.organization_types = ["Invented buyer"];
  assert.ok(
    validateIntake(sold).issues.some(
      (issue) => issue.path === "business_model.lead_is_for_internal_use",
    ),
  );
});

test("conversion-unit questions are explicit and conversion-specific", () => {
  const cases: Array<[ConversionUnit, string[]]> = [
    [
      "qualified_call",
      ["Call duration", "Recording and consent", "Connected-call conditions"],
    ],
    [
      "live_transfer",
      [
        "Call duration",
        "Warm-transfer acceptance",
        "Recording and consent",
        "Buyer connection conditions",
      ],
    ],
    [
      "appointment",
      [
        "Booking confirmation",
        "Attendance definition",
        "Reschedule and no-show rules",
      ],
    ],
    [
      "application",
      [
        "Application completion",
        "Eligibility conditions",
        "Required application fields",
      ],
    ],
    [
      "trial_or_demo",
      ["Activation definition", "Attendance or usage threshold"],
    ],
    ["custom_event", ["Custom event definition", "Acceptance proof"]],
    ["form_lead", []],
    ["quote_request", []],
    ["sale", []],
  ];
  cases.forEach(([unit, expected]) =>
    assert.deepEqual(requiredConditionalQuestions(unit), expected),
  );
});

test("one vague condition cannot satisfy multiple call questions", () => {
  const intake = readyInternalIntake();
  intake.business_model.conversion_unit = "qualified_call";
  intake.lead_product.required_fields_or_call_conditions = ["Connected call"];
  const result = validateIntake(intake);
  assert.ok(result.research_unknowns.some((item) => item.startsWith("Call duration")));
  assert.ok(
    result.research_unknowns.some((item) =>
      item.startsWith("Recording and consent"),
    ),
  );
  assert.ok(
    !result.research_unknowns.some((item) =>
      item.startsWith("Connected-call conditions"),
    ),
  );
});

test("unknown launch controls remain gates without blocking research", () => {
  const result = validateIntake(readyInternalIntake());
  assert.equal(result.passed, true);
  assert.ok(result.launch_gates.includes("Tracking and attribution"));
  assert.ok(result.launch_gates.includes("Acquisition ceiling"));
  assert.ok(result.research_unknowns.length > 0);
});

test("preflight exposes the exact ordered ten-section contract", () => {
  const result = validateIntake(readyInternalIntake());
  assert.deepEqual(
    result.expected_outputs.map((item) => item.markdown_path),
    SECTION_CONTRACT.map(([, , path]) => path),
  );
});
