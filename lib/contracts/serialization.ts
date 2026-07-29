import {
  ACQUISITION_MODELS,
  ANSWER_STATES,
  CONVERSION_UNITS,
  RESEARCH_PROFILES,
  SOURCE_ROLES,
  TEMPLATE_TREATMENTS,
  type CanonicalIntake,
  type FieldStateMap,
  type IntakePackage,
  type ProjectRecord,
  type RawAnswerMap,
  type SourceReference,
} from "./types";
import { createBlankProject, createEmptyIntake } from "./defaults";
import { validateIntake } from "./preflight";
import { assertNoSecretMaterial } from "./secrets";
import { parsePublicHttpUrl } from "@/lib/sources/url";

const SOURCE_STATUSES = [
  "registered",
  "available",
  "unavailable",
  "excluded",
] as const;

function recordAt(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string") throw new Error(`${path} must be a string.`);
}

function assertSourceReference(
  value: unknown,
  path: string,
  expectedKind: SourceReference["kind"],
): asserts value is SourceReference {
  const source = recordAt(value, path);
  const requiredKeys = [
    "id",
    "kind",
    "name",
    "url",
    "declared_type",
    "detected_type",
    "role",
    "template_treatment",
    "status",
    "notes",
    "byte_size",
    "last_modified",
  ];
  const actualKeys = Object.keys(source);
  if (
    requiredKeys.some((key) => !(key in source)) ||
    actualKeys.some((key) => !requiredKeys.includes(key))
  ) {
    throw new Error(`${path} does not match the source-reference contract.`);
  }
  ["id", "name", "declared_type", "detected_type", "notes"].forEach((key) =>
    assertString(source[key], `${path}.${key}`),
  );
  if (source.kind !== expectedKind) {
    throw new Error(`${path}.kind must be ${expectedKind}.`);
  }
  if (!SOURCE_ROLES.includes(source.role as (typeof SOURCE_ROLES)[number])) {
    throw new Error(`${path}.role is not supported.`);
  }
  if (
    !TEMPLATE_TREATMENTS.includes(
      source.template_treatment as (typeof TEMPLATE_TREATMENTS)[number],
    )
  ) {
    throw new Error(`${path}.template_treatment is not supported.`);
  }
  if (
    !SOURCE_STATUSES.includes(
      source.status as (typeof SOURCE_STATUSES)[number],
    )
  ) {
    throw new Error(`${path}.status is not supported.`);
  }
  if (
    source.byte_size !== null &&
    (typeof source.byte_size !== "number" ||
      !Number.isFinite(source.byte_size) ||
      source.byte_size < 0)
  ) {
    throw new Error(`${path}.byte_size must be a non-negative number or null.`);
  }
  if (source.last_modified !== null) {
    assertString(source.last_modified, `${path}.last_modified`);
  }
  if (expectedKind === "url") {
    assertString(source.url, `${path}.url`);
    parsePublicHttpUrl(source.url);
  } else if (source.url !== null) {
    throw new Error(`${path}.url must be null for a local file.`);
  }
}

function assertCanonicalShape(value: unknown, template: unknown, path: string): void {
  if (path === "$.sources.attachments" || path === "$.sources.urls") {
    if (!Array.isArray(value)) throw new Error(`${path} must be an array.`);
    const kind = path.endsWith("attachments") ? "local_file" : "url";
    value.forEach((source, index) =>
      assertSourceReference(source, `${path}[${index}]`, kind),
    );
    return;
  }
  if (Array.isArray(template)) {
    if (
      !Array.isArray(value) ||
      value.some((item) => typeof item !== "string")
    ) {
      throw new Error(`${path} must be an array of strings.`);
    }
    return;
  }
  if (template === null) {
    if (value !== null && typeof value !== "string") {
      throw new Error(`${path} must be a string or null.`);
    }
    return;
  }
  if (typeof template === "object") {
    const actual = recordAt(value, path);
    const expected = template as Record<string, unknown>;
    const expectedKeys = Object.keys(expected);
    if (
      expectedKeys.some((key) => !(key in actual)) ||
      Object.keys(actual).some((key) => !expectedKeys.includes(key))
    ) {
      throw new Error(`${path} does not match canonical schema 1.0.`);
    }
    expectedKeys.forEach((key) =>
      assertCanonicalShape(actual[key], expected[key], `${path}.${key}`),
    );
    return;
  }
  if (typeof value !== typeof template) {
    throw new Error(`${path} must be ${typeof template}.`);
  }
  if (
    typeof template === "number" &&
    (typeof value !== "number" || !Number.isFinite(value) || value < 0)
  ) {
    throw new Error(`${path} must be a non-negative finite number.`);
  }
}

export function assertCanonicalIntake(
  value: unknown,
): asserts value is CanonicalIntake {
  assertCanonicalShape(value, createEmptyIntake(), "$");
  const intake = value as CanonicalIntake;
  if (intake.schema_version !== "1.0") {
    throw new Error("$.schema_version must be 1.0.");
  }
  if (!RESEARCH_PROFILES.includes(intake.project.research_profile)) {
    throw new Error("$.project.research_profile is not supported.");
  }
  if (
    intake.business_model.acquisition_model !== "" &&
    !ACQUISITION_MODELS.includes(intake.business_model.acquisition_model)
  ) {
    throw new Error("$.business_model.acquisition_model is not supported.");
  }
  if (
    intake.business_model.conversion_unit !== "" &&
    !CONVERSION_UNITS.includes(intake.business_model.conversion_unit)
  ) {
    throw new Error("$.business_model.conversion_unit is not supported.");
  }
}

function assertFieldStates(value: unknown): asserts value is FieldStateMap {
  const states = recordAt(value, "$.field_states");
  Object.entries(states).forEach(([path, state]) => {
    if (!ANSWER_STATES.includes(state as (typeof ANSWER_STATES)[number])) {
      throw new Error(`$.field_states.${path} is not a supported answer state.`);
    }
  });
}

function assertRawAnswers(value: unknown): asserts value is RawAnswerMap {
  const answers = recordAt(value, "$.raw_answers");
  Object.entries(answers).forEach(([path, answer]) => {
    if (typeof answer !== "string") {
      throw new Error(`$.raw_answers.${path} must be a string.`);
    }
  });
}

export function createIntakePackage(project: ProjectRecord): IntakePackage {
  assertNoSecretMaterial(project.intake, "The saved intake");
  assertNoSecretMaterial(project.raw_answers, "The saved raw answers");
  return {
    contract: "lead-generation-intelligence-intake",
    contract_version: "1.0",
    intake: structuredClone(project.intake),
    field_states: structuredClone(project.field_states),
    raw_answers: structuredClone(project.raw_answers),
    source_manifest: [
      ...project.intake.sources.attachments,
      ...project.intake.sources.urls,
    ],
  };
}

export function serializeCanonicalIntake(project: ProjectRecord): string {
  assertNoSecretMaterial(project.intake, "The saved intake");
  return `${JSON.stringify(project.intake, null, 2)}\n`;
}

export function serializeIntakePackage(project: ProjectRecord): string {
  return `${JSON.stringify(createIntakePackage(project), null, 2)}\n`;
}

export function importProjectJson(
  json: string,
  now = new Date().toISOString(),
): ProjectRecord {
  const parsed = JSON.parse(json) as unknown;
  assertNoSecretMaterial(parsed, "The imported JSON");

  let intake: CanonicalIntake;
  let fieldStates: FieldStateMap = {};
  let rawAnswers: RawAnswerMap = {};

  if (
    parsed &&
    typeof parsed === "object" &&
    (parsed as Record<string, unknown>).contract ===
      "lead-generation-intelligence-intake"
  ) {
    const pkg = parsed as Record<string, unknown>;
    if (pkg.contract_version !== "1.0") {
      throw new Error("The workbench package contract_version must be 1.0.");
    }
    assertCanonicalIntake(pkg.intake);
    assertFieldStates(pkg.field_states);
    assertRawAnswers(pkg.raw_answers);
    if (!Array.isArray(pkg.source_manifest)) {
      throw new Error("$.source_manifest must be an array.");
    }
    const expectedManifest = collectSourceManifest(pkg.intake);
    if (JSON.stringify(pkg.source_manifest) !== JSON.stringify(expectedManifest)) {
      throw new Error(
        "The package source_manifest does not match the canonical intake sources.",
      );
    }
    intake = pkg.intake;
    fieldStates = pkg.field_states;
    rawAnswers = pkg.raw_answers;
  } else {
    assertCanonicalIntake(parsed);
    intake = parsed;
  }

  assertCanonicalIntake(intake);

  const project = createBlankProject(now);
  project.intake = structuredClone(intake);
  project.field_states = fieldStates;
  project.raw_answers = rawAnswers;
  project.updated_at = now;
  project.state = validateIntake(project.intake, project.field_states).passed
    ? "ready"
    : "draft";
  project.current_blocker =
    project.state === "ready" ? null : "Minimum brief is incomplete.";
  return project;
}

export function collectSourceManifest(intake: CanonicalIntake): SourceReference[] {
  return [...intake.sources.attachments, ...intake.sources.urls];
}
