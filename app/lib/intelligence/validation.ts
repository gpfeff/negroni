import { scanForExampleLeaks } from "@/lib/contracts/example-leak-scan.mjs";
import { assertNoSecretMaterial } from "@/lib/contracts/secrets-core.mjs";
import {
  RESEARCH_ARTIFACT_FILENAMES,
  type ResearchArtifactKey,
} from "@/lib/meta-ads/contracts";
import { validateCompetitorAdsIntelligence } from "@/lib/meta-ads/validation";
import {
  PROMPT_SOURCE_DOCUMENT_ID,
  RESEARCH_PROMPTS,
  type IntelligenceIntake,
  type RunResult,
} from "./contracts";

export const RUNNER_BLOCKER = "No secure five-prompt research runner and verified Google Workspace connector are configured for this environment.";
const ALLOWED_ACTIONS = ["public_research", "create_google_doc", "create_google_sheet", "configure_nightly_competitor_monitor"] as const;
const INTAKE_KEYS = [
  "allowed_actions",
  "competitor_monitoring",
  "contract",
  "contract_version",
  "country_region",
  "industry",
  "offer_or_lead_type",
  "prompt_source",
  "research_engine",
  "target_age_range",
] as const;
const RESULT_VALIDATIONS = [
  "citation_integrity",
  "competitor_monitor_receipt_verified",
  "competitor_ads_intelligence_verified",
  "competitor_rows_evidence_backed",
  "exactly_three_outputs",
  "example_leak_scan_passed",
  "five_prompt_sequence_verified",
  "google_doc_readback",
  "google_sheet_projection_checked",
  "markdown_doc_parity",
  "research_artifacts_verified",
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

function isHttpsUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isGoogleUrl(value: unknown, path: string): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "docs.google.com" && url.pathname.startsWith(path);
  } catch {
    return false;
  }
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function validAgeRange(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const match = value.trim().match(/^(\d{1,3})\s*(?:-|–|—|to)\s*(\d{1,3})$/i);
  if (!match) return false;
  const minimum = Number(match[1]);
  const maximum = Number(match[2]);
  return minimum >= 1 && maximum <= 120 && minimum <= maximum;
}

export function slugifyProjectName(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lead-generation-report";
}

export function buildResearchName(offerOrLeadType: string, countryRegion: string): string {
  const offer = offerOrLeadType.trim().replace(/\s+/g, " ");
  const country = countryRegion.trim().replace(/\s+/g, " ");
  return `${offer} (${country})`;
}

export function validateIntake(intake: IntelligenceIntake): string[] {
  const errors: string[] = [];
  if (!isRecord(intake)) return ["The research intake is invalid."];
  if (!hasExactKeys(intake, INTAKE_KEYS)) errors.push("The research intake contains unsupported fields.");
  if (intake.contract !== "lead-generation-intelligence-intake" || intake.contract_version !== "4.0") errors.push("The intake contract is not supported.");
  if (intake.research_engine !== "lead-generation-ads-discovery-intelligence") errors.push("The intake must use the canonical research engine.");
  if (!Array.isArray(intake.allowed_actions)
    || intake.allowed_actions.length !== ALLOWED_ACTIONS.length
    || ALLOWED_ACTIONS.some((action, index) => intake.allowed_actions[index] !== action)) {
    errors.push("The intake contains unsupported external actions.");
  }
  if (typeof intake.offer_or_lead_type !== "string" || intake.offer_or_lead_type.trim().length < 3 || intake.offer_or_lead_type.length > 240) {
    errors.push("Describe the lead offer or service.");
  }
  if (typeof intake.industry !== "string" || intake.industry.trim().length < 2 || intake.industry.length > 120) {
    errors.push("Enter the industry.");
  }
  if (typeof intake.country_region !== "string" || intake.country_region.trim().length < 2 || intake.country_region.length > 160) {
    errors.push("Enter the country or region.");
  }
  if (!validAgeRange(intake.target_age_range)) {
    errors.push("Enter a target age range such as 30–60.");
  }
  const promptSource = intake.prompt_source;
  if (!isRecord(promptSource)
    || !hasExactKeys(promptSource, ["document_id", "prompt_ids"])
    || promptSource.document_id !== PROMPT_SOURCE_DOCUMENT_ID
    || !Array.isArray(promptSource.prompt_ids)
    || promptSource.prompt_ids.length !== RESEARCH_PROMPTS.length
    || RESEARCH_PROMPTS.some((prompt, index) => promptSource.prompt_ids[index] !== prompt)) {
    errors.push("The required five-prompt research sequence is invalid.");
  }
  const monitoring = intake.competitor_monitoring;
  if (!isRecord(monitoring)
    || monitoring.enabled !== true
    || monitoring.engine !== "meta-ads-intelligence"
    || monitoring.cadence !== "nightly"
    || monitoring.local_time !== "02:17"
    || !isValidTimezone(monitoring.timezone)) {
    errors.push("The nightly competitor monitoring request is invalid.");
  }
  try {
    assertNoSecretMaterial(intake, "Research intake");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Remove secret material from the intake.");
  }
  return errors;
}

export function parseRunResult(value: unknown, researchName: string): RunResult {
  if (!isRecord(value)) throw new Error("The runner returned an invalid result.");
  const result = value as RunResult;
  if (result.contract !== "lead-generation-intelligence-result"
    || result.contract_version !== "4.0"
    || !["complete", "partial"].includes(result.status)
    || result.research_engine !== "lead-generation-ads-discovery-intelligence") {
    throw new Error("The runner did not attest to the canonical research contract.");
  }
  if (typeof result.run_id !== "string" || !result.run_id.trim() || !isTimestamp(result.completed_at)) {
    throw new Error("The runner receipt identity or completion time is invalid.");
  }

  const outputs = result.outputs;
  if (!isRecord(outputs) || !hasExactKeys(outputs, ["google_doc", "google_sheet", "markdown"])) {
    throw new Error("A successful run must contain exactly three deliverables.");
  }
  const googleDoc = outputs.google_doc;
  const googleSheet = outputs.google_sheet;
  const markdown = outputs.markdown;
  if (!isRecord(googleDoc) || !isGoogleUrl(googleDoc.url, "/document/d/") || googleDoc.verified !== true) {
    throw new Error("The Google Doc was not created and read back successfully.");
  }
  if (!isRecord(googleSheet)) throw new Error("The competitor Sheet receipt is missing.");
  if (!isRecord(markdown)) throw new Error("The Markdown report is missing, abbreviated, or misnamed.");
  if (googleDoc.title !== `${researchName} — Master Research`) throw new Error("The master research Doc title does not match the output contract.");
  if (googleSheet.title !== `${researchName} — Competitor Ads`) throw new Error("The competitor Sheet title does not match the output contract.");
  if (googleSheet.status === "published") {
    if (!hasExactKeys(googleSheet, ["status", "title", "url", "verified"])
      || !isGoogleUrl(googleSheet.url, "/spreadsheets/d/")
      || googleSheet.verified !== true) {
      throw new Error("The Google Sheet was not created and read back successfully.");
    }
  } else if (googleSheet.status === "not_configured") {
    if (!hasExactKeys(googleSheet, ["message", "status", "title", "url", "verified"])
      || googleSheet.url !== null
      || googleSheet.verified !== false
      || googleSheet.message !== "Google publishing not configured.") {
      throw new Error("The optional Google Sheet projection receipt is invalid.");
    }
  } else {
    throw new Error("The optional Google Sheet projection receipt has an unsupported status.");
  }
  const expectedFilename = `${slugifyProjectName(researchName)}-master-research.md`;
  if (markdown.filename !== expectedFilename
    || markdown.mime_type !== "text/markdown"
    || typeof markdown.content !== "string"
    || markdown.content.trim().length < 100) {
    throw new Error("The Markdown report is missing, abbreviated, or misnamed.");
  }

  if (!isRecord(result.validation)
    || !hasExactKeys(result.validation, RESULT_VALIDATIONS)
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
  if (!Array.isArray(result.limitations)
    || result.limitations.some((limitation) => typeof limitation !== "string" || !limitation.trim())) {
    throw new Error("The research limitations receipt is invalid.");
  }
  const citedIds = [...markdown.content.matchAll(/\[([A-Z][A-Z0-9-]*\d+)\]/g)].map((match) => match[1]);
  if (citedIds.length === 0 || citedIds.some((id) => !sourceIds.has(id))) {
    throw new Error("The Markdown report contains missing or unresolved citations.");
  }

  const execution = result.prompt_execution;
  if (!isRecord(execution)
    || !hasExactKeys(execution, ["prompts", "source_document_id", "source_modified_at"])
    || execution.source_document_id !== PROMPT_SOURCE_DOCUMENT_ID
    || !isTimestamp(execution.source_modified_at)
    || !isRecord(execution.prompts)
    || !hasExactKeys(execution.prompts, RESEARCH_PROMPTS)) {
    throw new Error("The five-prompt execution receipt is incomplete.");
  }
  let hasLimitedPrompt = false;
  for (const prompt of RESEARCH_PROMPTS) {
    const receipt = execution.prompts[prompt];
    if (!isRecord(receipt) || !hasExactKeys(receipt, ["limitation", "status"]) || !["complete", "limited"].includes(receipt.status as string)) {
      throw new Error(`The ${prompt} prompt receipt is invalid.`);
    }
    if (receipt.status === "limited") {
      hasLimitedPrompt = true;
      if (typeof receipt.limitation !== "string" || !receipt.limitation.trim()) {
        throw new Error(`The ${prompt} prompt limitation is missing.`);
      }
    } else if (receipt.limitation !== null) {
      throw new Error(`The ${prompt} prompt receipt is inconsistent.`);
    }
  }

  const monitoring = result.competitor_monitoring;
  if (!isRecord(monitoring)
    || monitoring.engine !== "meta-ads-intelligence"
    || monitoring.cadence !== "nightly"
    || monitoring.local_time !== "02:17"
    || !isValidTimezone(monitoring.timezone)
    || !Number.isInteger(monitoring.watch_count)
    || (monitoring.watch_count as number) < 0
    || (monitoring.last_run_at !== null && !isTimestamp(monitoring.last_run_at))) {
    throw new Error("The nightly competitor monitoring receipt is invalid.");
  }
  if (monitoring.status === "active") {
    if (typeof monitoring.schedule_id !== "string"
      || !monitoring.schedule_id.trim()
      || (monitoring.watch_count as number) < 1
      || !isTimestamp(monitoring.next_run_at)
      || monitoring.blocker !== null) {
      throw new Error("The runner did not prove that nightly competitor monitoring is active.");
    }
  } else if (monitoring.status === "blocked") {
    if (monitoring.schedule_id !== null
      || monitoring.next_run_at !== null
      || typeof monitoring.blocker !== "string"
      || !monitoring.blocker.trim()) {
      throw new Error("The runner returned an invalid competitor monitoring blocker.");
    }
  } else {
    throw new Error("The nightly competitor monitoring receipt has an unsupported status.");
  }

  validateCompetitorAdsIntelligence(result.competitor_ads);
  if (result.competitor_ads.links.google_sheet !== googleSheet.url) {
    throw new Error("The competitor-ad intelligence Sheet link does not match the verified deliverable.");
  }
  if (!isRecord(result.research_artifacts)
    || !hasExactKeys(result.research_artifacts, Object.keys(RESEARCH_ARTIFACT_FILENAMES))) {
    throw new Error("The five durable Research artifact receipts are incomplete.");
  }
  for (const key of Object.keys(RESEARCH_ARTIFACT_FILENAMES) as ResearchArtifactKey[]) {
    const receipt = result.research_artifacts[key];
    if (!isRecord(receipt)
      || !hasExactKeys(receipt, ["filename", "sha256", "verified"])
      || receipt.filename !== RESEARCH_ARTIFACT_FILENAMES[key]
      || typeof receipt.sha256 !== "string"
      || !/^[a-f0-9]{64}$/.test(receipt.sha256)
      || receipt.verified !== true) {
      throw new Error(`The ${RESEARCH_ARTIFACT_FILENAMES[key]} receipt is invalid.`);
    }
  }

  const shouldBePartial = hasLimitedPrompt || monitoring.status === "blocked";
  if ((shouldBePartial && result.status !== "partial") || (!shouldBePartial && result.status !== "complete")) {
    throw new Error("The run status does not match its prompt and monitoring receipts.");
  }
  assertNoSecretMaterial(result, "Research result");
  if (!scanForExampleLeaks(result).passed) throw new Error("The result contains prohibited structural-example material.");
  return result;
}
