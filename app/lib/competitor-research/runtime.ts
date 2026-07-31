import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  unlink,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type NormalizedAd,
  type ProviderName,
  type RunState,
  type WinnerSignal,
} from "./contracts.ts";
import { EnrichmentSession, type EnrichmentProvider } from "./enrichment.ts";
import {
  FakeDriveProjection,
  deterministicAdManifestPath,
} from "./drive-contract.ts";
import { buildCompetitorResearchArtifacts, stableJson } from "./handoff.ts";
import { stableAdIdentity, stableNamespacedId } from "./ids.ts";
import {
  FakeSheetsProjection,
  transitionOutbox,
  type ProjectionOutboxItem,
} from "./sheet-contract.ts";
import {
  canonicalEvidenceUrl,
  knownValue,
  unknownValue,
  validateNormalizedAd,
  validateRootRouting,
} from "./validation.ts";
import { computePublicWinnerSignal } from "./winner-signal.ts";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPOSITORY_ROOT = resolve(APP_ROOT, "..");
const ID_RE = /^[a-z][a-z0-9_-]{2,127}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const PUBLIC_CLI_PROVIDERS = ["normalized_import", "official_meta_api"] as const;
const ARTIFACT_NAMES = [
  "research-brief.md",
  "evidence-index.json",
  "opportunity-map.json",
  "creative-brief.json",
  "research-receipt.json",
] as const;

type CliOptions = {
  project: string;
  mode: "nightly";
  json: true;
  dryRun: boolean;
  resumeRun: string | null;
  provider: ProviderName | null;
  deadlineSeconds: number;
};

type FixtureProject = {
  contract: "negroni-competitor-fixture-project";
  contract_version: "1.0";
  project_id: string;
  profile: string;
  provider: "normalized_import";
  watch: { id: string; page_id: string; advertiser_name: string };
  nights: Array<{ number: number; run_id: string; observed_at: string; payload: string }>;
  fake_google: true;
  fake_ai_failure_night: number | null;
  fake_sheet_link_failure_night: number | null;
  fixture_directory: string;
};

type EngineAd = {
  library_id: string;
  page_id: string;
  page_name: string;
  ad_library_url: string;
  first_seen_at: string;
  last_seen_at: string;
  ad_text: string;
  landing_url: string;
  content_hash: string;
  current_content_version_id: number;
  lifecycle_status: NormalizedAd["lifecycle_status"];
  consecutive_complete_absences: number;
  observed_days: number;
  successful_observations: number;
  family_id: number | null;
};

type EngineFamily = {
  id: number;
  advertiser_key: string;
  media_type: string;
  basis: string;
  related_ad_ids: number;
  library_ids: string;
};

type EngineMedia = { sha256: string; media_type: string; byte_size: number };

type EngineResult = {
  contract: "negroni-meta-engine-fixture-result";
  contract_version: "1.0";
  run_id: string;
  status: string;
  started_at: string;
  completed_at: string;
  idempotent: boolean;
  schema_version: number;
  database_sha256: string;
  counts: Record<string, number>;
  ads: EngineAd[];
  families: EngineFamily[];
  media: EngineMedia[];
};

type PersistedRun = {
  run_id: string;
  night: number;
  attempt_count: number;
  status: RunState;
  checkpoint: string;
  receipt_revision: number;
  receipt_path: string | null;
  engine: EngineResult | null;
};

type RuntimeState = {
  contract: "negroni-competitor-runtime-state";
  contract_version: "1.0";
  project_id: string;
  runs: Record<string, PersistedRun>;
  completed_nights: number[];
  latest_receipt_path: string | null;
  sheets: ReturnType<FakeSheetsProjection["exportState"]> | null;
  drive: ReturnType<FakeDriveProjection["exportState"]> | null;
  outbox: ProjectionOutboxItem[];
  simulated_failures: string[];
};

type RunResult = { exitCode: 0 | 3 | 4 | 5 | 64; receipt: Record<string, unknown> };
type RunControl = { signal?: AbortSignal };

class RunInterruptedError extends Error {
  constructor() {
    super("The local competitor-research run was interrupted before completion.");
    this.name = "RunInterruptedError";
  }
}

function throwIfInterrupted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new RunInterruptedError();
}

async function fixturePauseAfterRunning(signal?: AbortSignal): Promise<void> {
  if (process.env.NEGRONI_TEST_MODE !== "1") return;
  const milliseconds = Number(process.env.NEGRONI_TEST_PAUSE_AFTER_RUNNING_MS ?? "0");
  if (!Number.isInteger(milliseconds) || milliseconds <= 0 || milliseconds > 10_000) return;
  throwIfInterrupted(signal);
  await new Promise<void>((resolvePause, rejectPause) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", interrupted);
      resolvePause();
    }, milliseconds);
    const interrupted = () => {
      clearTimeout(timer);
      rejectPause(new RunInterruptedError());
    };
    signal?.addEventListener("abort", interrupted, { once: true });
  });
}

function digest(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function inside(path: string, parent: string): boolean {
  const difference = relative(parent, path);
  return difference === "" || (!difference.startsWith(`..${sep}`) && difference !== "..");
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
  await chmod(path, 0o600);
}

async function writeImmutable(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  let handle;
  try {
    handle = await open(path, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (await readFile(path, "utf8") !== content) {
      throw new Error(`Immutable artifact collision at ${path}.`);
    }
    return;
  }
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function initialState(projectId: string): RuntimeState {
  return {
    contract: "negroni-competitor-runtime-state",
    contract_version: "1.0",
    project_id: projectId,
    runs: {},
    completed_nights: [],
    latest_receipt_path: null,
    sheets: null,
    drive: null,
    outbox: [],
    simulated_failures: [],
  };
}

function parseOptions(args: string[]): CliOptions {
  const values = new Map<string, string>();
  let dryRun = false;
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (!["--project", "--mode", "--resume-run", "--provider", "--deadline-seconds"].includes(argument)) {
      throw new Error(`Unsupported CLI argument: ${argument}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
    if (values.has(argument)) throw new Error(`${argument} can be supplied only once.`);
    values.set(argument, value);
    index += 1;
  }
  const project = values.get("--project") ?? "";
  if (!ID_RE.test(project)) throw new Error("--project must be a stable lowercase research-set ID.");
  if (values.get("--mode") !== "nightly") throw new Error("--mode nightly is required.");
  if (!json) throw new Error("--json is required for the stable command contract.");
  const providerValue = values.get("--provider") ?? null;
  if (providerValue !== null && !PUBLIC_CLI_PROVIDERS.includes(providerValue as typeof PUBLIC_CLI_PROVIDERS[number])) {
    throw new Error("--provider is not configured or supported.");
  }
  const deadline = Number(values.get("--deadline-seconds") ?? "120");
  if (!Number.isInteger(deadline) || deadline < 5 || deadline > 300) {
    throw new Error("--deadline-seconds must be an integer from 5 through 300.");
  }
  const resumeRun = values.get("--resume-run") ?? null;
  if (resumeRun !== null && !ID_RE.test(resumeRun)) throw new Error("--resume-run contains an invalid run ID.");
  return {
    project,
    mode: "nightly",
    json: true,
    dryRun,
    resumeRun,
    provider: providerValue as CliOptions["provider"],
    deadlineSeconds: deadline,
  };
}

function configuredRoots() {
  const repositoryRoot = resolve(process.env.NEGRONI_REPOSITORY_ROOT || REPOSITORY_ROOT);
  const runtimeRoot = resolve(process.env.NEGRONI_RUNTIME_ROOT || homedir(), process.env.NEGRONI_RUNTIME_ROOT ? "" : ".local/share/negroni");
  const artifactRoot = resolve(process.env.NEGRONI_ARTIFACT_ROOT || homedir(), process.env.NEGRONI_ARTIFACT_ROOT ? "" : "Documents/tools-negroni");
  return validateRootRouting({
    repository_root: repositoryRoot,
    runtime_root: runtimeRoot,
    artifact_root: artifactRoot,
    allow_test_roots: process.env.NEGRONI_TEST_MODE === "1",
  });
}

async function loadFixtureProject(options: CliOptions, runtimeRoot: string): Promise<FixtureProject> {
  if (process.env.NEGRONI_TEST_MODE !== "1") {
    throw new Error("No live normalized-import project is configured; only the sanitized test fixture is enabled in v1.");
  }
  const fixtureRoot = resolve(process.env.NEGRONI_COMPETITOR_FIXTURE_ROOT || "");
  const configPath = resolve(fixtureRoot, options.project, "project.json");
  if (!inside(configPath, fixtureRoot)) throw new Error("Fixture project resolution escaped its repository fixture root.");
  const value = await readJson<Omit<FixtureProject, "fixture_directory">>(configPath);
  if (value.contract !== "negroni-competitor-fixture-project"
    || value.contract_version !== "1.0"
    || value.project_id !== options.project
    || value.profile !== options.project
    || value.provider !== "normalized_import"
    || value.fake_google !== true
    || !ID_RE.test(value.watch?.id)
    || !/^\d{5,40}$/.test(value.watch?.page_id)
    || !value.watch?.advertiser_name?.trim()
    || !Array.isArray(value.nights)
    || value.nights.length !== 2) {
    throw new Error("The sanitized competitor fixture project is invalid.");
  }
  for (const [index, night] of value.nights.entries()) {
    const payloadPath = resolve(dirname(configPath), night.payload);
    if (night.number !== index + 1
      || !ID_RE.test(night.run_id)
      || !Number.isFinite(Date.parse(night.observed_at))
      || !inside(payloadPath, fixtureRoot)) {
      throw new Error("The sanitized competitor fixture night is invalid.");
    }
  }
  const projectRuntime = resolve(runtimeRoot, "competitor-research/projects", options.project);
  if (!inside(projectRuntime, runtimeRoot)) throw new Error("Project runtime isolation failed.");
  return { ...value, fixture_directory: dirname(configPath) };
}

async function invokeEngine(input: {
  config: FixtureProject;
  night: FixtureProject["nights"][number];
  profileRoot: string;
  repositoryRoot: string;
  deadlineSeconds: number;
  signal?: AbortSignal;
}): Promise<EngineResult> {
  throwIfInterrupted(input.signal);
  const helper = resolve(APP_ROOT, "bin/competitor-research-engine.py");
  const engineRoot = resolve(input.repositoryRoot, "meta-ads-intelligence");
  const payload = resolve(input.config.fixture_directory, input.night.payload);
  const childResult = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolveChild, rejectChild) => {
    const child = spawn("python3", [
      helper,
      "--engine-root", engineRoot,
      "--profile-root", input.profileRoot,
      "--profile", input.config.profile,
      "--watch-id", input.config.watch.id,
      "--page-id", input.config.watch.page_id,
      "--payload", payload,
      "--run-id", input.night.run_id,
      "--observed-at", input.night.observed_at,
    ], {
      env: {
        PATH: process.env.PATH || "/usr/bin:/bin",
        NODE_ENV: process.env.NODE_ENV || "test",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let terminalError: Error | null = null;
    let forceTimer: ReturnType<typeof setTimeout> | null = null;
    const stopChild = (error: Error) => {
      terminalError ??= error;
      child.kill("SIGTERM");
      forceTimer ??= setTimeout(() => child.kill("SIGKILL"), 2_000);
    };
    const deadlineTimer = setTimeout(
      () => stopChild(new Error("The isolated competitor fixture engine exceeded its bounded deadline.")),
      input.deadlineSeconds * 1000,
    );
    const interrupted = () => stopChild(new RunInterruptedError());
    input.signal?.addEventListener("abort", interrupted, { once: true });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > 10_000_000) stopChild(new Error("The isolated competitor fixture engine exceeded its output bound."));
    });
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length <= 10_000) stderr += chunk;
    });
    child.once("error", (error) => {
      terminalError ??= error;
    });
    child.once("close", (code) => {
      clearTimeout(deadlineTimer);
      if (forceTimer) clearTimeout(forceTimer);
      input.signal?.removeEventListener("abort", interrupted);
      if (terminalError) rejectChild(terminalError);
      else resolveChild({ code, stdout, stderr });
    });
  });
  if (childResult.code !== 0 || !childResult.stdout.trim()) {
    const bounded = childResult.stderr.trim().slice(0, 500).replace(/[?&][^\s=]+=[^\s&]+/g, "?[redacted]");
    throw new Error(bounded || "The isolated competitor fixture engine failed.");
  }
  const result = JSON.parse(childResult.stdout) as EngineResult;
  if (result.contract !== "negroni-meta-engine-fixture-result"
    || result.contract_version !== "1.0"
    || result.run_id !== input.night.run_id
    || result.schema_version !== 2
    || !SHA256_RE.test(result.database_sha256)
    || !Array.isArray(result.ads)
    || !Array.isArray(result.families)
    || !Array.isArray(result.media)) {
    throw new Error("The external engine returned an invalid fixture result.");
  }
  return result;
}

function normalizedAds(projectId: string, engine: EngineResult): NormalizedAd[] {
  const familyIds = new Map<number, string>();
  for (const family of engine.families) {
    familyIds.set(family.id, stableNamespacedId(
      "fam",
      projectId,
      family.advertiser_key,
      ...family.library_ids.split(",").sort(),
    ).id);
  }
  const competitorId = stableNamespacedId("cmp", "meta", engine.ads[0]?.page_id ?? "unknown").id;
  return engine.ads.map((ad) => {
    const identity = stableAdIdentity({
      platform: "meta",
      provider: "normalized_import",
      public_ad_id: ad.library_id,
      stable_source_locator: null,
      content_locator: null,
    });
    const first = Date.parse(ad.first_seen_at);
    const last = Date.parse(ad.last_seen_at);
    const normalized: NormalizedAd = {
      contract: "negroni-normalized-ad",
      contract_version: "1.0",
      project_id: projectId,
      ad_record_id: identity.ad_record_id,
      platform: "meta",
      provider: "normalized_import",
      public_ad_id: ad.library_id,
      identity_basis: identity.identity_basis,
      identity_confidence: identity.identity_confidence,
      identity_reason: identity.low_confidence_reason,
      advertiser_id: ad.page_id,
      advertiser_name: ad.page_name,
      competitor_id: competitorId,
      source_url: canonicalEvidenceUrl(ad.ad_library_url),
      first_observed_at: new Date(first).toISOString(),
      last_observed_at: new Date(last).toISOString(),
      lifecycle_status: ad.lifecycle_status,
      successful_observations: Number(ad.successful_observations),
      missed_eligible_observations: Number(ad.consecutive_complete_absences),
      days_observed_active: Number(ad.observed_days),
      observed_span_days: Math.max(1, Math.floor((last - first) / 86_400_000) + 1),
      copy: knownValue(ad.ad_text),
      headline: unknownValue("The normalized fixture source does not expose a separate headline."),
      cta: unknownValue("The normalized fixture source does not expose a verified CTA."),
      landing_page_url: knownValue(canonicalEvidenceUrl(ad.landing_url)),
      creative_format: knownValue(engine.media[0]?.media_type === "video" ? "video" : "single_image"),
      content_version_id: stableNamespacedId("cv", projectId, ad.library_id, ad.content_hash).id,
      creative_family_id: ad.family_id === null ? null : familyIds.get(ad.family_id) ?? null,
      collection_status: engine.status === "complete_zero" ? "complete_zero" : "complete",
      evidence_confidence: Number(ad.observed_days) >= 4 ? "medium" : "low",
      limitations: [],
      source_payload_sha256: ad.content_hash,
    };
    return validateNormalizedAd(normalized);
  });
}

function winnerSignals(ads: NormalizedAd[], engine: EngineResult, computedAt: string): WinnerSignal[] {
  const familySizes = new Map<string, number>();
  for (const family of engine.families) {
    const stable = stableNamespacedId("fam", ads[0]?.project_id ?? "unknown", family.advertiser_key, ...family.library_ids.split(",").sort()).id;
    familySizes.set(stable, Number(family.related_ad_ids));
  }
  return ads.map((ad) => computePublicWinnerSignal({
    ad_record_id: ad.ad_record_id,
    distinct_eligible_observation_days: ad.days_observed_active,
    successful_eligible_observations: ad.successful_observations,
    related_family_ad_ids: ad.creative_family_id ? familySizes.get(ad.creative_family_id) ?? 1 : 1,
    verified_offer_formats: null,
    verified_placements: null,
    verified_markets: null,
    verified_landing_page_expansions: null,
    repeated_pattern_families: null,
    exact_stable_identity: ad.identity_confidence === "high",
    latest_scan_complete: engine.status === "complete" || engine.status === "complete_zero",
    required_source_hashes_present: SHA256_RE.test(ad.source_payload_sha256),
    media_or_unavailable_reason_present: engine.media.length > 0,
    unresolved_coverage_gap: false,
    contradictory_evidence: false,
    identity_confidence: ad.identity_confidence,
    computed_at: computedAt,
  }));
}

function outboxCounts(items: ProjectionOutboxItem[]) {
  return {
    pending: items.filter((item) => item.state === "pending").length,
    drive_uploaded: items.filter((item) => item.state === "drive_uploaded").length,
    sheet_linked: items.filter((item) => item.state === "sheet_linked").length,
    complete: items.filter((item) => item.state === "complete").length,
  };
}

function projectFakeGoogle(input: {
  state: RuntimeState;
  config: FixtureProject;
  night: FixtureProject["nights"][number];
  ads: NormalizedAd[];
  signals: WinnerSignal[];
  engine: EngineResult;
  resume: boolean;
}) {
  const sheets = new FakeSheetsProjection(input.config.project_id, input.state.sheets ?? undefined);
  const drive = new FakeDriveProjection(input.config.project_id, input.state.drive ?? undefined);
  sheets.ensureContract();
  sheets.upsertRows("Competitors", "competitor_id", [{
    competitor_id: input.ads[0]?.competitor_id ?? "cmp_unknown",
    advertiser_name: input.config.watch.advertiser_name,
    provider: "normalized_import",
  }]);
  sheets.upsertRows("Ads", "ad_record_id", input.ads.map((ad) => ({
    ad_record_id: ad.ad_record_id,
    competitor_id: ad.competitor_id,
    public_ad_id: ad.public_ad_id,
    lifecycle_status: ad.lifecycle_status,
    ad_copy: ad.copy.value,
    content_version_id: ad.content_version_id,
  })));
  sheets.upsertRows("Public Winner Signals", "ad_record_id", input.signals.map((signal) => ({
    ad_record_id: signal.ad_record_id,
    score_version: signal.score_version,
    score: signal.score,
    confidence: signal.confidence,
    classification: signal.classification,
    explanation: signal.explanation,
  })));
  sheets.upsertRows("Runs", "run_id", [{
    run_id: input.night.run_id,
    status: input.engine.status,
    observed_at: input.night.observed_at,
  }]);
  sheets.upsertRows("Run Health", "run_id", [{
    run_id: input.night.run_id,
    coverage_complete: true,
    observations: input.engine.counts.observations,
    limitations: "",
  }]);

  for (const media of input.engine.media) {
    drive.putMedia({
      sha256: media.sha256,
      mime_type: media.media_type === "video" ? "video/mp4" : "image/png",
      byte_size: Number(media.byte_size),
    });
  }

  let simulatedFailure = false;
  for (const ad of input.ads) {
    const manifest = {
      contract: "negroni-competitor-ad-manifest",
      contract_version: "1.0",
      project_id: input.config.project_id,
      platform: ad.platform,
      provider: ad.provider,
      public_ad_id: ad.public_ad_id,
      ad_record_id: ad.ad_record_id,
      competitor_id: ad.competitor_id,
      advertiser_id: ad.advertiser_id,
      advertiser_name: ad.advertiser_name,
      source_url: ad.source_url,
      source_payload_sha256: ad.source_payload_sha256,
      content_version_id: ad.content_version_id,
      creative_family_id: ad.creative_family_id,
      media_sha256: input.engine.media.map((item) => item.sha256),
      collection_limitations: ad.limitations,
      observed_at: input.night.observed_at,
    };
    const manifestSha = digest(stableJson(manifest));
    const logicalPath = deterministicAdManifestPath({
      platform: ad.platform,
      advertiser_name: ad.advertiser_name,
      competitor_id: ad.competitor_id,
      ad_record_id: ad.ad_record_id,
      content_version_id: ad.content_version_id,
      manifest_sha256: manifestSha,
    });
    const stored = drive.putManifest(logicalPath, manifest);
    let item = input.state.outbox.find((candidate) => candidate.logical_key === logicalPath);
    if (!item) {
      item = { logical_key: logicalPath, state: "pending", attempts: 0, last_error: null };
      input.state.outbox.push(item);
    }
    if (item.state === "pending") {
      const next = transitionOutbox(item, "drive_uploaded");
      Object.assign(item, next, { drive_file_id: stored.drive_file_id });
    }
    const failureKey = `sheet-link-night-${input.night.number}`;
    if (item.state === "drive_uploaded"
      && input.config.fake_sheet_link_failure_night === input.night.number
      && !input.resume
      && !input.state.simulated_failures.includes(failureKey)) {
      input.state.simulated_failures.push(failureKey);
      item.last_error = "Simulated fixture Sheet link failure after durable fake Drive upload.";
      simulatedFailure = true;
      continue;
    }
    if (item.state === "drive_uploaded") {
      sheets.upsertRows("Assets", "logical_key", [{
        logical_key: item.logical_key,
        drive_file_id: item.drive_file_id ?? null,
        ad_record_id: ad.ad_record_id,
        content_version_id: ad.content_version_id,
      }]);
      Object.assign(item, transitionOutbox(item, "sheet_linked"), { sheet_key: item.logical_key });
    }
    if (item.state === "sheet_linked") Object.assign(item, transitionOutbox(item, "complete"));
  }

  input.state.sheets = sheets.exportState();
  input.state.drive = drive.exportState();
  const counts = outboxCounts(input.state.outbox);
  const tabs = ["Competitors", "Ads", "Assets", "Public Winner Signals", "Runs", "Run Health"] as const;
  const sheetReceipts = tabs.map((tab) => sheets.verifyReadback(tab));
  const mediaVerified = input.engine.media.every((media) => drive.verifyReadback(media.sha256).verified);
  return {
    simulatedFailure,
    receipt: {
      mode: "fake",
      external_mutation: false,
      outbox: counts,
      drive_objects: drive.objects().length,
      drive_manifests: drive.manifests().length,
      sheet_rows: Object.fromEntries(tabs.map((tab) => [tab, sheets.readRows(tab).length])),
      protections_verified: sheetReceipts.every((receipt) => receipt.protections_verified),
      readback_verified: !simulatedFailure
        && counts.pending === 0
        && counts.drive_uploaded === 0
        && counts.sheet_linked === 0
        && mediaVerified
        && sheetReceipts.every((receipt) => receipt.readback_verified),
    },
  };
}

function validFixtureClassification(sourceText: string) {
  const span = sourceText.slice(0, Math.min(sourceText.length, 60));
  return {
    creative_format: "static_graphic",
    hook: "Synthetic process hook",
    angle: "Clear process",
    offer: "unknown",
    customer_pain: "unknown",
    customer_objection: "unknown",
    awareness_stage: "problem_aware",
    landing_page_pattern: "single service page",
    evidence_spans: span ? [span] : [],
    confidence: "low",
    unknown_fields: ["performance", "spend", "conversion data"],
  } as const;
}

async function runEnrichment(input: {
  state: RuntimeState;
  config: FixtureProject;
  night: FixtureProject["nights"][number];
  ads: NormalizedAd[];
  resume: boolean;
}) {
  if (input.config.fake_ai_failure_night !== input.night.number) {
    const session = new EnrichmentSession({ budget_usd: 0, provider: null });
    return { completed: 0, failed: 0, spent_usd: 0, mode: session.receipt().mode };
  }
  const failureKey = `ai-malformed-night-${input.night.number}`;
  const shouldFail = !input.resume && !input.state.simulated_failures.includes(failureKey);
  const sourceText = input.ads[0]?.copy.value ?? "";
  const provider: EnrichmentProvider = {
    async classify() {
      return shouldFail ? { untrusted_extra: "malformed fixture response" } : validFixtureClassification(sourceText);
    },
  };
  const session = new EnrichmentSession({ budget_usd: 0.05, provider });
  const result = await session.classify({
    entity_id: input.ads[0]?.ad_record_id ?? "ad_fixture_missing",
    source_text: sourceText,
    input_sha256: digest(sourceText),
    schema_version: "1.0",
    prompt_version: "competitor-enrichment-v1",
    model: "fake-provider",
    estimated_cost_usd: 0.01,
  });
  if (result.status === "failed" && !input.state.simulated_failures.includes(failureKey)) {
    input.state.simulated_failures.push(failureKey);
  }
  return {
    completed: result.classification ? 1 : 0,
    failed: result.status === "failed" ? 1 : 0,
    spent_usd: result.cost_usd,
    mode: "fake",
  };
}

async function writeArtifactRevision(input: {
  artifactRoot: string;
  config: FixtureProject;
  run: PersistedRun;
  generatedAt: string;
  status: "complete" | "partial";
  ads: NormalizedAd[];
  signals: WinnerSignal[];
  limitations: string[];
  google: Record<string, unknown>;
}) {
  const revision = input.run.receipt_revision + 1;
  const revisionId = `${input.run.run_id}-revision-${String(revision).padStart(3, "0")}`;
  const directory = resolve(
    input.artifactRoot,
    "research/competitor-research",
    input.config.project_id,
    input.run.run_id,
    `revision-${String(revision).padStart(3, "0")}`,
  );
  if (!inside(directory, input.artifactRoot)) throw new Error("Research artifact routing escaped the durable artifact root.");
  const bundle = buildCompetitorResearchArtifacts({
    project_id: input.config.project_id,
    run_id: input.run.run_id,
    revision_id: revisionId,
    status: input.status,
    generated_at: input.generatedAt,
    ads: input.ads.map((ad) => ({
      ad_record_id: ad.ad_record_id,
      advertiser_name: ad.advertiser_name,
      source_url: ad.source_url,
      first_observed_at: ad.first_observed_at,
      last_observed_at: ad.last_observed_at,
      lifecycle_status: ad.lifecycle_status,
      creative_family_id: ad.creative_family_id,
    })),
    winner_signals: input.signals,
    limitations: input.limitations,
    engine_counts: input.run.engine?.counts ?? {},
    projection: {
      kind: "fake",
      status: input.status,
      readback_verified: input.google.readback_verified === true,
    },
  });
  const contents = [
    bundle.research_brief.endsWith("\n") ? bundle.research_brief : `${bundle.research_brief}\n`,
    `${JSON.stringify(bundle.evidence_index, null, 2)}\n`,
    `${JSON.stringify(bundle.opportunity_map, null, 2)}\n`,
    `${JSON.stringify(bundle.creative_brief, null, 2)}\n`,
    `${JSON.stringify(bundle.research_receipt, null, 2)}\n`,
  ];
  const receipts = [];
  for (const [index, name] of ARTIFACT_NAMES.entries()) {
    const path = resolve(directory, name);
    await writeImmutable(path, contents[index]);
    const readback = await readFile(path);
    receipts.push({
      artifact: name,
      path,
      sha256: digest(readback),
      byte_size: readback.byteLength,
      verified: readback.toString("utf8") === contents[index],
    });
  }
  return { revision, revisionId, directory, receipts };
}

function receiptFingerprint(receipt: Record<string, unknown>): string {
  const withoutFingerprint = { ...receipt };
  delete withoutFingerprint.receipt_sha256;
  delete withoutFingerprint.idempotent_replay;
  return digest(`${stableJson(withoutFingerprint)}\n`);
}

function boundedError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Competitor research failed.";
  return message
    .replace(/authorization:\s*bearer\s+[^\s]+/gi, "authorization: Bearer [redacted]")
    .replace(/[?&][^\s=]+=[^\s&]+/g, "?[redacted]")
    .slice(0, 500);
}

async function writeCollectionReceipt(directory: string, receipt: Record<string, unknown>) {
  const path = resolve(directory, "collection-receipt.json");
  receipt.receipt_path = path;
  receipt.receipt_sha256 = receiptFingerprint(receipt);
  await writeImmutable(path, `${JSON.stringify(receipt, null, 2)}\n`);
  return path;
}

async function standaloneReceipt(input: {
  artifactRoot: string;
  projectId: string;
  runId: string;
  provider: ProviderName;
  status: "blocked" | "skipped" | "complete" | "partial" | "failed";
  limitations: string[];
  dryRun?: boolean;
  suffix?: string;
  resumeCommand?: string | null;
  errorCode?: string;
  error?: string;
}): Promise<Record<string, unknown>> {
  const suffix = input.suffix ?? (input.dryRun ? "dry-run" : input.status);
  const directory = resolve(input.artifactRoot, "research/competitor-research", input.projectId, input.runId, suffix);
  const receipt: Record<string, unknown> = {
    contract: "negroni-competitor-collection-receipt",
    contract_version: "1.0",
    run_id: input.runId,
    project_id: input.projectId,
    provider: input.provider,
    trigger: "manual",
    mode: "nightly",
    status: input.status,
    dry_run: input.dryRun === true,
    external_actions: [],
    limitations: input.limitations,
    resume_command: input.resumeCommand ?? null,
    ...(input.errorCode ? { error_code: input.errorCode } : {}),
    ...(input.error ? { error: input.error } : {}),
    artifact_receipts: [],
    receipt_path: "",
  };
  const path = resolve(directory, "collection-receipt.json");
  receipt.receipt_path = path;
  receipt.receipt_sha256 = receiptFingerprint(receipt);
  try {
    await writeImmutable(path, `${JSON.stringify(receipt, null, 2)}\n`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return readJson<Record<string, unknown>>(path);
  }
  return receipt;
}

async function writeRunningReceipt(input: {
  artifactRoot: string;
  projectId: string;
  runId: string;
  attempt: number;
}): Promise<string> {
  const directory = resolve(
    input.artifactRoot,
    "research/competitor-research",
    input.projectId,
    input.runId,
    `attempt-${String(input.attempt).padStart(3, "0")}`,
  );
  if (!inside(directory, input.artifactRoot)) throw new Error("Running receipt routing escaped the durable artifact root.");
  const path = resolve(directory, "running-receipt.json");
  const receipt: Record<string, unknown> = {
    contract: "negroni-competitor-collection-receipt",
    contract_version: "1.0",
    run_id: input.runId,
    project_id: input.projectId,
    trigger: "manual",
    mode: "nightly",
    status: "running",
    attempt: input.attempt,
    external_actions: [],
    limitations: ["This immutable checkpoint records that local fixture work started; it is not a completed coverage receipt."],
    receipt_path: path,
  };
  receipt.receipt_sha256 = receiptFingerprint(receipt);
  await writeImmutable(path, `${JSON.stringify(receipt, null, 2)}\n`);
  return path;
}

async function execute(options: CliOptions, control: RunControl = {}): Promise<RunResult> {
  throwIfInterrupted(control.signal);
  const roots = configuredRoots();
  if (options.provider === "official_meta_api") {
    const runId = options.resumeRun ?? stableNamespacedId("run", options.project, options.provider).id;
    const receipt = await standaloneReceipt({
      artifactRoot: roots.artifact_root,
      projectId: options.project,
      runId,
      provider: options.provider,
      status: "blocked",
      limitations: ["Official Meta API collection is blocked until a bounded live provider proof and authorization are separately approved and verified."],
    });
    return { exitCode: 4, receipt };
  }
  const config = await loadFixtureProject(options, roots.runtime_root);
  const provider = options.provider ?? config.provider;
  const nextRunId = options.resumeRun ?? config.nights[0].run_id;
  if (options.dryRun) {
    const receipt = await standaloneReceipt({
      artifactRoot: roots.artifact_root,
      projectId: config.project_id,
      runId: `${nextRunId}_dry_run`,
      provider,
      status: "complete",
      dryRun: true,
      limitations: ["Dry-run only: no SQLite ingestion, media write, projection, Google action, or artifact handoff was applied."],
    });
    return { exitCode: 0, receipt };
  }

  const projectRuntime = resolve(roots.runtime_root, "competitor-research/projects", config.project_id);
  const statePath = resolve(projectRuntime, "state.json");
  const lockPath = resolve(projectRuntime, ".nightly.lock");
  await mkdir(projectRuntime, { recursive: true, mode: 0o700 });
  let lockHandle;
  try {
    lockHandle = await open(lockPath, "wx", 0o600);
    await lockHandle.writeFile(`${process.pid}\n`, "utf8");
    await lockHandle.sync();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const receipt = await standaloneReceipt({
      artifactRoot: roots.artifact_root,
      projectId: config.project_id,
      runId: `${nextRunId}_overlap`,
      provider,
      status: "skipped",
      limitations: ["A per-profile nightly lock reported an overlapping eligible run; no second engine or projection mutation started."],
    });
    return { exitCode: 4, receipt };
  }

  let state: RuntimeState | null = null;
  let night: FixtureProject["nights"][number] | undefined;
  let run: PersistedRun | undefined;
  try {
    try {
      state = await readJson<RuntimeState>(statePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      state = initialState(config.project_id);
    }
    if (state.project_id !== config.project_id || state.contract !== "negroni-competitor-runtime-state") {
      throw new Error("The private runtime state belongs to another project.");
    }
    if (!options.resumeRun && state.completed_nights.length === config.nights.length && state.latest_receipt_path) {
      const previous = await readJson<Record<string, unknown>>(state.latest_receipt_path);
      return { exitCode: 0, receipt: { ...previous, idempotent_replay: true } };
    }

    if (options.resumeRun) {
      const persisted = state.runs[options.resumeRun];
      if (!persisted || persisted.status !== "partial") {
        throw new Error("--resume-run must name a durable partial run in this project profile.");
      }
      night = config.nights.find((item) => item.run_id === options.resumeRun);
    } else {
      const completedNights = state.completed_nights;
      night = config.nights.find((item) => !completedNights.includes(item.number));
    }
    if (!night) throw new Error("No eligible fixture night is available for this command.");
    const resume = options.resumeRun === night.run_id;
    run = state.runs[night.run_id] ?? {
      run_id: night.run_id,
      night: night.number,
      attempt_count: 0,
      status: "created",
      checkpoint: "created",
      receipt_revision: 0,
      receipt_path: null,
      engine: null,
    };
    run.attempt_count ??= 0;
    run.attempt_count += 1;
    state.runs[night.run_id] = run;
    run.status = "running";
    run.checkpoint = run.engine ? "engine_complete" : "running_receipt";
    await atomicWriteJson(statePath, state);
    await atomicWriteJson(resolve(projectRuntime, "runs", night.run_id, "checkpoint.json"), {
      contract: "negroni-competitor-run-checkpoint",
      contract_version: "1.0",
      project_id: config.project_id,
      run_id: night.run_id,
      status: "running",
      checkpoint: run.checkpoint,
      attempt: run.attempt_count,
      running_receipt_path: await writeRunningReceipt({
        artifactRoot: roots.artifact_root,
        projectId: config.project_id,
        runId: night.run_id,
        attempt: run.attempt_count,
      }),
      external_actions: [],
    });
    await fixturePauseAfterRunning(control.signal);
    throwIfInterrupted(control.signal);

    if (!run.engine) {
      run.engine = await invokeEngine({
        config,
        night,
        profileRoot: resolve(projectRuntime, "engine-profile"),
        repositoryRoot: roots.repository_root,
        deadlineSeconds: options.deadlineSeconds,
        signal: control.signal,
      });
      run.checkpoint = "engine_complete";
      await atomicWriteJson(statePath, state);
    }
    throwIfInterrupted(control.signal);
    const ads = normalizedAds(config.project_id, run.engine);
    const signals = winnerSignals(ads, run.engine, night.observed_at);
    const projection = projectFakeGoogle({ state, config, night, ads, signals, engine: run.engine, resume });
    const enrichment = await runEnrichment({ state, config, night, ads, resume });
    throwIfInterrupted(control.signal);
    const limitations: string[] = [];
    if (projection.simulatedFailure) {
      limitations.push("A simulated fake Sheet link failure left one durable outbox item at drive_uploaded; no external Google action occurred.");
    }
    if (enrichment.failed) {
      limitations.push("The fake AI provider returned malformed output twice; deterministic evidence processing continued without a fabricated classification.");
    }
    const status = limitations.length ? "partial" as const : "complete" as const;
    run.status = status;
    run.checkpoint = status === "complete" ? "complete" : "projection_partial";
    const artifacts = await writeArtifactRevision({
      artifactRoot: roots.artifact_root,
      config,
      run,
      generatedAt: night.observed_at,
      status,
      ads,
      signals,
      limitations,
      google: projection.receipt,
    });
    throwIfInterrupted(control.signal);
    const receipt: Record<string, unknown> = {
      contract: "negroni-competitor-collection-receipt",
      contract_version: "1.0",
      run_id: night.run_id,
      project_id: config.project_id,
      trigger: "manual",
      mode: "nightly",
      provider: "normalized_import",
      provider_capability: "sanitized_fixture_verified",
      started_at: run.engine.started_at,
      completed_at: run.engine.completed_at,
      status,
      receipt_revision: artifacts.revision,
      revision_id: artifacts.revisionId,
      idempotent: run.engine.idempotent,
      dry_run: false,
      engine: {
        owner: "meta-ads-intelligence",
        schema_version: run.engine.schema_version,
        database_sha256: run.engine.database_sha256,
        counts: run.engine.counts,
      },
      ads: ads.map((ad) => ({
        ad_record_id: ad.ad_record_id,
        public_ad_id: ad.public_ad_id,
        content_version_id: ad.content_version_id,
        creative_family_id: ad.creative_family_id,
        lifecycle_status: ad.lifecycle_status,
      })),
      observations: {
        present: run.engine.counts.present_observations,
        absent_eligible: run.engine.counts.absent_observations,
      },
      media: {
        objects: run.engine.counts.media_objects,
        reused_by_multiple_ads: run.engine.counts.family_members > run.engine.counts.media_objects,
      },
      enrichment,
      google: projection.receipt,
      winner_signals: signals,
      research_handoff: {
        status: "approval_required",
        reason: "Creative can consume only a separately approved immutable creative-brief revision and SHA-256.",
      },
      artifact_receipts: artifacts.receipts,
      limitations,
      resume_command: status === "partial"
        ? `negroni research competitors run --project ${config.project_id} --mode nightly --resume-run ${night.run_id} --json`
        : null,
      external_actions: [],
      receipt_path: "",
    };
    const receiptPath = await writeCollectionReceipt(artifacts.directory, receipt);
    run.receipt_revision = artifacts.revision;
    run.receipt_path = receiptPath;
    state.latest_receipt_path = receiptPath;
    if (status === "complete" && !state.completed_nights.includes(night.number)) {
      state.completed_nights.push(night.number);
      state.completed_nights.sort();
    }
    await atomicWriteJson(statePath, state);
    await atomicWriteJson(resolve(projectRuntime, "runs", night.run_id, "checkpoint.json"), {
      contract: "negroni-competitor-run-checkpoint",
      contract_version: "1.0",
      project_id: config.project_id,
      run_id: night.run_id,
      status,
      checkpoint: run.checkpoint,
      receipt_revision: run.receipt_revision,
      receipt_sha256: receipt.receipt_sha256,
      external_actions: [],
    });
    return { exitCode: status === "partial" ? 3 : 0, receipt };
  } catch (error) {
    const interrupted = error instanceof RunInterruptedError;
    const runId = night?.run_id ?? options.resumeRun ?? nextRunId;
    const attempt = run?.attempt_count ?? 1;
    const resumeCommand = interrupted
      ? `negroni research competitors run --project ${config.project_id} --mode nightly --resume-run ${runId} --json`
      : `negroni research competitors run --project ${config.project_id} --mode nightly --json`;
    const terminalStatus = interrupted ? "partial" as const : "failed" as const;
    const receipt = await standaloneReceipt({
      artifactRoot: roots.artifact_root,
      projectId: config.project_id,
      runId,
      provider,
      status: terminalStatus,
      suffix: `attempt-${String(attempt).padStart(3, "0")}`,
      resumeCommand,
      errorCode: interrupted ? "run_interrupted" : "local_runtime_failure",
      error: boundedError(error),
      limitations: [
        interrupted
          ? "The local fixture run was safely interrupted before a complete Research revision was available; resume from its durable checkpoint."
          : "The local fixture run failed before a complete Research revision was available; retry only after reviewing the durable checkpoint and error.",
        "No live provider, Google, browser, scheduler, ad-account, publishing, or spend action was attempted.",
      ],
    });
    if (state && run) {
      run.status = terminalStatus;
      run.checkpoint = interrupted ? "interrupted" : "failed";
      run.receipt_path = String(receipt.receipt_path);
      state.latest_receipt_path = run.receipt_path;
      await atomicWriteJson(statePath, state);
      await atomicWriteJson(resolve(projectRuntime, "runs", runId, "checkpoint.json"), {
        contract: "negroni-competitor-run-checkpoint",
        contract_version: "1.0",
        project_id: config.project_id,
        run_id: runId,
        status: terminalStatus,
        checkpoint: run.checkpoint,
        attempt,
        receipt_sha256: receipt.receipt_sha256,
        resume_command: resumeCommand,
        external_actions: [],
      });
    }
    return { exitCode: interrupted ? 3 : 5, receipt };
  } finally {
    await lockHandle.close();
    await unlink(lockPath).catch(() => undefined);
  }
}

export async function runCompetitorResearchCli(args: string[], control: RunControl = {}): Promise<RunResult> {
  let options: CliOptions;
  try {
    options = parseOptions(args);
  } catch (error) {
    return {
      exitCode: 64,
      receipt: {
        contract: "negroni-competitor-cli-error",
        contract_version: "1.0",
        status: "failed",
        error_code: "invalid_cli",
        error: error instanceof Error ? error.message : "Invalid competitor research command.",
        external_actions: [],
      },
    };
  }
  try {
    return await execute(options, control);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Competitor research failed.";
    const invalid = /invalid|must|required|configured|routing|isolation|eligible fixture night|resume-run/i.test(message);
    return {
      exitCode: invalid ? 64 : 5,
      receipt: {
        contract: "negroni-competitor-collection-receipt",
        contract_version: "1.0",
        run_id: options.resumeRun,
        project_id: options.project,
        status: "failed",
        error_code: invalid ? "invalid_configuration" : "local_runtime_failure",
        error: message.slice(0, 500),
        limitations: ["No live provider, Google, browser, scheduler, ad-account, publishing, or spend action was attempted."],
        external_actions: [],
      },
    };
  }
}
