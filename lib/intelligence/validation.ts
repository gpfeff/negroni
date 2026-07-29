import { scanForExampleLeaks } from "@/lib/contracts/example-leak-scan.mjs";
import { assertNoSecretMaterial } from "@/lib/contracts/secrets-core.mjs";
import { FIELD_STATES, OPTIONAL_FIELD_IDS, type IntelligenceIntake, type RunResult } from "./contracts";

export const RUNNER_BLOCKER = "No secure canonical-skill runner and verified Google Workspace connector are configured for this environment.";

export function slugifyProjectName(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lead-generation-report";
}

export function validateIntake(intake: IntelligenceIntake): string[] {
  const errors: string[] = [];
  if (intake.contract !== "lead-generation-intelligence-intake" || intake.contract_version !== "2.0") errors.push("The intake contract is not supported.");
  if (intake.project_name.trim().length < 2) errors.push("Enter a project or report name.");
  const structuredContext = OPTIONAL_FIELD_IDS.some((id) => intake.fields[id]?.state === "answered" && intake.fields[id].value.trim().length >= 3);
  if (intake.market_context.trim().length < 10 && !structuredContext) errors.push("Add at least one substantive piece of market context.");
  for (const id of OPTIONAL_FIELD_IDS) {
    const field = intake.fields[id];
    if (!field || !FIELD_STATES.includes(field.state)) errors.push(`The ${id} field has an invalid state.`);
    else if (field.state === "answered" && !field.value.trim()) errors.push(`Add an answer for ${id.replaceAll("_", " ")} or choose another state.`);
  }
  try { assertNoSecretMaterial(intake, "Research intake"); }
  catch (error) { errors.push(error instanceof Error ? error.message : "Remove secret material from the intake."); }
  if (!scanForExampleLeaks(intake).passed) errors.push("Remove structural-example market material from the intake.");
  return errors;
}

function isGoogleUrl(value: string, path: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "docs.google.com" && url.pathname.startsWith(path);
  } catch { return false; }
}

export function parseRunResult(value: unknown, projectName: string): RunResult {
  if (!value || typeof value !== "object") throw new Error("The runner returned an invalid result.");
  const result = value as RunResult;
  if (result.contract !== "lead-generation-intelligence-result" || result.contract_version !== "2.0" || result.status !== "complete" || result.research_engine !== "lead-generation-ads-discovery-intelligence") {
    throw new Error("The runner did not attest to the canonical research contract.");
  }
  if (!result.outputs || Object.keys(result.outputs).sort().join(",") !== "google_doc,google_sheet,markdown") throw new Error("A successful run must contain exactly three deliverables.");
  if (!isGoogleUrl(result.outputs.google_doc.url, "/document/d/") || !result.outputs.google_doc.verified) throw new Error("The Google Doc was not created and read back successfully.");
  if (!isGoogleUrl(result.outputs.google_sheet.url, "/spreadsheets/d/") || !result.outputs.google_sheet.verified) throw new Error("The Google Sheet was not created and read back successfully.");
  if (result.outputs.google_sheet.title !== `${projectName.trim()} — Competitor Report`) throw new Error("The competitor Sheet title does not match the output contract.");
  const expectedFilename = `${slugifyProjectName(projectName)}-main-report.md`;
  if (result.outputs.markdown.filename !== expectedFilename || result.outputs.markdown.mime_type !== "text/markdown" || result.outputs.markdown.content.trim().length < 100) throw new Error("The Markdown report is missing, abbreviated, or misnamed.");
  if (!result.validation || Object.values(result.validation).some((passed) => passed !== true)) throw new Error("The runner did not pass every delivery and evidence validation.");
  const sourceIds = new Set((result.sources ?? []).map((source) => source.id));
  const citedIds = [...result.outputs.markdown.content.matchAll(/\[([A-Z][A-Z0-9-]*\d+)\]/g)].map((match) => match[1]);
  if (sourceIds.size === 0 || citedIds.length === 0 || citedIds.some((id) => !sourceIds.has(id))) throw new Error("The Markdown report contains missing or unresolved citations.");
  assertNoSecretMaterial(result, "Research result");
  if (!scanForExampleLeaks(result).passed) throw new Error("The result contains prohibited structural-example material.");
  return result;
}
