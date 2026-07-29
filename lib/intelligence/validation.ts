import { scanForExampleLeaks } from "@/lib/contracts/example-leak-scan.mjs";
import { assertNoSecretMaterial } from "@/lib/contracts/secrets-core.mjs";
import { FIELD_STATES, OPTIONAL_FIELD_IDS, RESEARCH_LANES, type IntelligenceIntake, type RunResult } from "./contracts";

export const RUNNER_BLOCKER = "No secure canonical-skill runner and verified Google Workspace connector are configured for this environment.";
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const ALLOWED_ACTIONS = ["public_research", "create_google_doc", "create_google_sheet", "configure_nightly_competitor_monitor"] as const;
const RESULT_VALIDATIONS = [
  "citation_integrity",
  "competitor_monitor_receipt_verified",
  "competitor_rows_evidence_backed",
  "exactly_three_outputs",
  "example_leak_scan_passed",
  "google_doc_readback",
  "google_sheet_readback",
  "markdown_doc_parity",
  "research_coverage_verified",
  "secret_scan_passed",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isValidTimezone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

export function slugifyProjectName(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lead-generation-report";
}

export function validateIntake(intake: IntelligenceIntake): string[] {
  const errors: string[] = [];
  if (!intake || typeof intake !== "object" || Array.isArray(intake)) return ["The research intake is invalid."];
  if (intake.contract !== "lead-generation-intelligence-intake" || intake.contract_version !== "3.0") errors.push("The intake contract is not supported.");
  if (intake.research_engine !== "lead-generation-ads-discovery-intelligence") errors.push("The intake must use the canonical research engine.");
  if (!Array.isArray(intake.allowed_actions)
    || intake.allowed_actions.length !== ALLOWED_ACTIONS.length
    || ALLOWED_ACTIONS.some((action, index) => intake.allowed_actions[index] !== action)) {
    errors.push("The intake contains unsupported external actions.");
  }
  const monitoring = intake.competitor_monitoring;
  if (!monitoring
    || monitoring.enabled !== true
    || monitoring.engine !== "meta-ads-intelligence"
    || monitoring.cadence !== "nightly"
    || monitoring.local_time !== "02:17"
    || !isValidTimezone(monitoring.timezone)) {
    errors.push("The nightly competitor monitoring request is invalid.");
  }
  if (typeof intake.project_name !== "string" || intake.project_name.trim().length < 2) errors.push("Enter a project or report name.");
  const fields = intake.fields && typeof intake.fields === "object" && !Array.isArray(intake.fields) ? intake.fields : null;
  if (!fields || Object.keys(fields).sort().join(",") !== [...OPTIONAL_FIELD_IDS].sort().join(",")) errors.push("The intake field set does not match the supported contract.");
  const structuredContext = fields
    ? OPTIONAL_FIELD_IDS.some((id) => fields[id]?.state === "answered" && typeof fields[id].value === "string" && fields[id].value.trim().length >= 3)
    : false;
  if ((typeof intake.market_context !== "string" || intake.market_context.trim().length < 10) && !structuredContext) errors.push("Add at least one substantive piece of market context.");
  for (const id of OPTIONAL_FIELD_IDS) {
    const field = fields?.[id];
    if (!field || !FIELD_STATES.includes(field.state)) errors.push(`The ${id} field has an invalid state.`);
    else if (typeof field.value !== "string") errors.push(`The ${id} field has an invalid value.`);
    else if (field.state === "answered" && !field.value.trim()) errors.push(`Add an answer for ${id.replaceAll("_", " ")} or choose another state.`);
  }
  if (!Array.isArray(intake.attachments) || intake.attachments.length > 5) {
    errors.push("Attach no more than five files.");
  } else {
    let totalBytes = 0;
    for (const attachment of intake.attachments) {
      if (!attachment
        || typeof attachment.name !== "string"
        || !attachment.name.trim()
        || attachment.name.includes("/")
        || attachment.name.includes("\\")
        || !Number.isSafeInteger(attachment.size)
        || attachment.size < 0
        || attachment.size > MAX_ATTACHMENT_BYTES
        || typeof attachment.type !== "string"
        || !Number.isSafeInteger(attachment.last_modified)
        || attachment.last_modified < 0) {
        errors.push("One or more attachment metadata records are invalid.");
        break;
      }
      totalBytes += attachment.size;
    }
    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) errors.push("Attachments must total 50 MB or less.");
  }
  try { assertNoSecretMaterial(intake, "Research intake"); }
  catch (error) { errors.push(error instanceof Error ? error.message : "Remove secret material from the intake."); }
  if (!scanForExampleLeaks(intake).passed) errors.push("Remove structural-example market material from the intake.");
  return errors;
}

function isGoogleUrl(value: unknown, path: string): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "docs.google.com" && url.pathname.startsWith(path);
  } catch { return false; }
}

function isHttpsUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function parseRunResult(value: unknown, projectName: string): RunResult {
  if (!isRecord(value)) throw new Error("The runner returned an invalid result.");
  const result = value as RunResult;
  if (result.contract !== "lead-generation-intelligence-result"
    || result.contract_version !== "3.0"
    || !["complete", "partial"].includes(result.status)
    || result.research_engine !== "lead-generation-ads-discovery-intelligence") {
    throw new Error("The runner did not attest to the canonical research contract.");
  }
  if (typeof result.run_id !== "string" || !result.run_id.trim() || !isTimestamp(result.completed_at)) throw new Error("The runner receipt identity or completion time is invalid.");
  const outputs = result.outputs;
  if (!isRecord(outputs) || Object.keys(outputs).sort().join(",") !== "google_doc,google_sheet,markdown") throw new Error("A successful run must contain exactly three deliverables.");
  const googleDoc = outputs.google_doc;
  const googleSheet = outputs.google_sheet;
  const markdown = outputs.markdown;
  if (!isRecord(googleDoc) || !isGoogleUrl(googleDoc.url, "/document/d/") || googleDoc.verified !== true) throw new Error("The Google Doc was not created and read back successfully.");
  if (!isRecord(googleSheet) || !isGoogleUrl(googleSheet.url, "/spreadsheets/d/") || googleSheet.verified !== true) throw new Error("The Google Sheet was not created and read back successfully.");
  if (!isRecord(markdown)) throw new Error("The Markdown report is missing, abbreviated, or misnamed.");
  if (googleDoc.title !== `${projectName.trim()} — Master Research`) throw new Error("The master research Doc title does not match the output contract.");
  if (googleSheet.title !== `${projectName.trim()} — Competitor Ads`) throw new Error("The competitor Sheet title does not match the output contract.");
  const expectedFilename = `${slugifyProjectName(projectName)}-master-research.md`;
  if (markdown.filename !== expectedFilename || markdown.mime_type !== "text/markdown" || typeof markdown.content !== "string" || markdown.content.trim().length < 100) throw new Error("The Markdown report is missing, abbreviated, or misnamed.");
  if (!isRecord(result.validation)
    || Object.keys(result.validation).sort().join(",") !== [...RESULT_VALIDATIONS].sort().join(",")
    || Object.values(result.validation).some((passed) => passed !== true)) {
    throw new Error("The runner did not pass every delivery and evidence validation.");
  }
  if (!Array.isArray(result.sources) || result.sources.length === 0) throw new Error("The research result has no attributable sources.");
  const sourceIds = new Set<string>();
  for (const source of result.sources) {
    if (!source
      || typeof source.id !== "string"
      || !/^[A-Z][A-Z0-9-]*\d+$/.test(source.id)
      || sourceIds.has(source.id)
      || typeof source.title !== "string"
      || !source.title.trim()
      || !isTimestamp(source.accessed_at)
      || !isHttpsUrl(source.url)) {
      throw new Error("The research result contains invalid source metadata.");
    }
    sourceIds.add(source.id);
  }
  if (!Array.isArray(result.limitations) || result.limitations.some((limitation) => typeof limitation !== "string" || !limitation.trim())) {
    throw new Error("The research limitations receipt is invalid.");
  }
  const citedIds = [...markdown.content.matchAll(/\[([A-Z][A-Z0-9-]*\d+)\]/g)].map((match) => match[1]);
  if (sourceIds.size === 0 || citedIds.length === 0 || citedIds.some((id) => !sourceIds.has(id))) throw new Error("The Markdown report contains missing or unresolved citations.");
  const coverage = result.research_coverage;
  if (!coverage || Object.keys(coverage).sort().join(",") !== [...RESEARCH_LANES].sort().join(",")) {
    throw new Error("The research coverage receipt is incomplete.");
  }
  let hasLimitedCoverage = false;
  for (const lane of RESEARCH_LANES) {
    const state = coverage[lane];
    if (!state || !["complete", "limited"].includes(state.status)) throw new Error(`The ${lane} research coverage state is invalid.`);
    if (state.status === "limited") {
      hasLimitedCoverage = true;
      if (typeof state.limitation !== "string" || !state.limitation.trim()) throw new Error(`The ${lane} research limitation is missing.`);
    } else if (state.limitation !== null) {
      throw new Error(`The ${lane} research coverage receipt is inconsistent.`);
    }
  }
  const monitoring = result.competitor_monitoring;
  if (!monitoring
    || monitoring.engine !== "meta-ads-intelligence"
    || monitoring.cadence !== "nightly"
    || monitoring.local_time !== "02:17"
    || !isValidTimezone(monitoring.timezone)
    || !Number.isInteger(monitoring.watch_count)
    || monitoring.watch_count < 0
    || (monitoring.last_run_at !== null && !isTimestamp(monitoring.last_run_at))) {
    throw new Error("The nightly competitor monitoring receipt is invalid.");
  }
  if (monitoring.status === "active") {
    if (typeof monitoring.schedule_id !== "string"
      || !monitoring.schedule_id.trim()
      || monitoring.watch_count < 1
      || !isTimestamp(monitoring.next_run_at)
      || monitoring.blocker !== null) {
      throw new Error("The runner did not prove that nightly competitor monitoring is active.");
    }
  } else if (monitoring.status === "blocked") {
    if (result.status !== "partial"
      || monitoring.schedule_id !== null
      || monitoring.next_run_at !== null
      || typeof monitoring.blocker !== "string"
      || !monitoring.blocker.trim()) {
      throw new Error("The runner returned an invalid competitor monitoring blocker.");
    }
  } else {
    throw new Error("The nightly competitor monitoring receipt has an unsupported status.");
  }
  const shouldBePartial = hasLimitedCoverage || monitoring.status === "blocked";
  if ((shouldBePartial && result.status !== "partial") || (!shouldBePartial && result.status !== "complete")) {
    throw new Error("The run status does not match its research coverage and monitoring receipts.");
  }
  assertNoSecretMaterial(result, "Research result");
  if (!scanForExampleLeaks(result).passed) throw new Error("The result contains prohibited structural-example material.");
  return result;
}
