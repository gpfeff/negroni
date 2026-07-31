#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { containsSecretMaterial } from "../lib/contracts/secrets-core.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = resolve(appRoot, "..");
const cliPath = resolve(appRoot, "bin/negroni.mjs");
const ID_PATTERN = /^[a-z][a-z0-9_-]{2,127}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const DRAPER_INTENTS = new Set([
  "inspect_brand",
  "search_ads",
  "compare_creatives",
  "analyze_performance",
  "explain_loop_state",
  "retrieve_learnings",
  "inspect_data_gaps",
  "propose_experiment",
  "propose_loop_policy_change",
  "prepare_change_diff",
]);
const SCOPE_SCHEMA = {
  type: "object",
  required: ["owner_id", "workspace_id", "brand_id"],
  additionalProperties: false,
  properties: {
    owner_id: { type: "string", pattern: "^[a-z][a-z0-9_-]{2,127}$" },
    workspace_id: { type: "string", pattern: "^[a-z][a-z0-9_-]{2,127}$" },
    brand_id: { type: "string", pattern: "^[a-z][a-z0-9_-]{2,127}$" },
  },
};
const ARTIFACTS = new Set([
  "research-brief.md",
  "evidence-index.json",
  "opportunity-map.json",
  "creative-brief.json",
  "research-receipt.json",
  "collection-receipt.json",
]);
const OMIT_RESULT_KEY = /(?:^|_)(?:path|directory|credential|credentials|token|password|cookie|secret)$/i;
const PRIVATE_PATH = /(?:file:\/\/\/|(?:^|[\s"'=:(\[])(?:\/(?!\/)[A-Za-z0-9._~+-][^\s"'<>]*|[A-Za-z]:\\))/i;
const PRIVATE_PATH_REDACTION = /(^|[\s"'=:(\[])(file:\/\/\/[^\s'"`,;}\]]+|\/(?!\/)[A-Za-z0-9._~+-][^\s'"`,;}\]]*|[A-Za-z]:\\[^\s'"`,;}\]]*)/gi;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

const TOOLS = [
  {
    name: "capability_status",
    description: "Inspect Negroni's local, hosted, provider, Google, and scheduler readiness without returning credentials or local paths.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "learning_core_status",
    description: "Inspect local SQLite, FTS5, rebuildable-vector, vault-projection, and catalog readiness without returning private paths.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "draper_query",
    description: "Ask Draper one validated brand-scoped question. Returns evidence, freshness, assumptions, limitations, and reviewable proposals but cannot execute external actions.",
    inputSchema: {
      type: "object",
      required: ["scope", "intent", "question"],
      additionalProperties: false,
      properties: {
        scope: SCOPE_SCHEMA,
        intent: { type: "string", enum: [...DRAPER_INTENTS] },
        question: { type: "string", minLength: 1, maxLength: 1000 },
        query: { type: "string", minLength: 1, maxLength: 500 },
        ad_ids: {
          type: "array",
          maxItems: 10,
          uniqueItems: true,
          items: { type: "string", pattern: "^[a-z][a-z0-9_-]{2,127}$" },
        },
        token_budget: { type: "integer", minimum: 64, maximum: 4000, default: 800 },
      },
    },
  },
  {
    name: "draper_record_decision",
    description: "Record an exact approved or rejected Draper proposal in the local Learning Core. This never executes the proposal or changes an ad account.",
    inputSchema: {
      type: "object",
      required: ["scope", "proposal_id", "proposal_hash", "decision", "approved_by", "rationale", "decided_at"],
      additionalProperties: false,
      properties: {
        scope: SCOPE_SCHEMA,
        proposal_id: { type: "string", pattern: "^[a-z][a-z0-9_-]{2,127}$" },
        proposal_hash: { type: "string", pattern: "^[a-f0-9]{64}$" },
        decision: { type: "string", enum: ["approved", "rejected"] },
        approved_by: { type: "string", pattern: "^[a-z][a-z0-9_-]{2,127}$" },
        rationale: { type: "string", minLength: 1, maxLength: 2000 },
        decided_at: { type: "string", format: "date-time" },
      },
    },
  },
  {
    name: "competitor_research",
    description: "Run the stable provider-neutral nightly competitor boundary. Dry-run is the default and live providers remain fail-closed.",
    inputSchema: {
      type: "object",
      required: ["project"],
      additionalProperties: false,
      properties: {
        project: { type: "string", pattern: "^[a-z][a-z0-9_-]{2,127}$" },
        dry_run: { type: "boolean", default: true },
        provider: { type: "string", enum: ["normalized_import", "official_meta_api"] },
        deadline_seconds: { type: "integer", minimum: 5, maximum: 300, default: 120 },
      },
    },
  },
  {
    name: "resume_competitor_research",
    description: "Resume one durable partial competitor run through the stable CLI. Dry-run is the default.",
    inputSchema: {
      type: "object",
      required: ["project", "run_id"],
      additionalProperties: false,
      properties: {
        project: { type: "string", pattern: "^[a-z][a-z0-9_-]{2,127}$" },
        run_id: { type: "string", pattern: "^[a-z][a-z0-9_-]{2,127}$" },
        dry_run: { type: "boolean", default: true },
        deadline_seconds: { type: "integer", minimum: 5, maximum: 300, default: 120 },
      },
    },
  },
  {
    name: "inspect_research_artifact",
    description: "Verify one immutable competitor-research artifact or collection receipt by bounded identifiers and SHA-256, without exposing its local path.",
    inputSchema: {
      type: "object",
      required: ["project", "run_id", "revision", "artifact"],
      additionalProperties: false,
      properties: {
        project: { type: "string", pattern: "^[a-z][a-z0-9_-]{2,127}$" },
        run_id: { type: "string", pattern: "^[a-z][a-z0-9_-]{2,127}$" },
        revision: { type: "integer", minimum: 1, maximum: 999 },
        artifact: { type: "string", enum: [...ARTIFACTS] },
      },
    },
  },
];

function exactObject(value, allowed, required = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Tool input must be an object.");
  }
  const keys = Object.keys(value);
  const unsupported = keys.find((key) => !allowed.includes(key));
  if (unsupported) throw new Error(`Unsupported input: ${unsupported}.`);
  const missing = required.find((key) => !keys.includes(key));
  if (missing) throw new Error(`Required input is missing: ${missing}.`);
  return value;
}

function stableId(value, label) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw new Error(`${label} must be a stable lowercase identifier.`);
  }
  return value;
}

function boundedText(value, label, maximum) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maximum) {
    throw new Error(`${label} must contain 1 through ${maximum} characters.`);
  }
  return value.trim();
}

function stableScope(value) {
  const input = exactObject(value, ["owner_id", "workspace_id", "brand_id"], ["owner_id", "workspace_id", "brand_id"]);
  return {
    owner_id: stableId(input.owner_id, "owner_id"),
    workspace_id: stableId(input.workspace_id, "workspace_id"),
    brand_id: stableId(input.brand_id, "brand_id"),
  };
}

function safeDraperInput(value) {
  if (containsSecretMaterial(value)) throw new Error("Draper input contains credential-like material.");
  if (PRIVATE_PATH.test(JSON.stringify(value))) {
    throw new Error("Draper input contains a private local path.");
  }
}

function boundedDeadline(value) {
  if (value === undefined) return 120;
  if (!Number.isInteger(value) || value < 5 || value > 300) {
    throw new Error("deadline_seconds must be an integer from 5 through 300.");
  }
  return value;
}

function dryRunDefault(value) {
  if (value === undefined) return true;
  if (typeof value !== "boolean") throw new Error("dry_run must be a boolean.");
  return value;
}

function redactString(value) {
  let output = value
    .replace(/\bBearer\s+[A-Za-z0-9._~-]{8,}/gi, "[redacted-sensitive-value]")
    .replace(/\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|client[_ -]?secret)\s*[:=]\s*[^\s,;}\]]+/gi, "[redacted-sensitive-value]")
    .replace(PRIVATE_PATH_REDACTION, "$1[redacted-local-path]")
    .replace(/[A-Za-z]:\\[^\s'\"`,;}\]]+/g, "[redacted-local-path]");
  if (containsSecretMaterial(output)) output = "[redacted-sensitive-value]";
  return output;
}

function sanitize(value) {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (OMIT_RESULT_KEY.test(key)) continue;
    output[key] = sanitize(child);
  }
  return output;
}

function safeResult(value) {
  const result = sanitize(value);
  if (containsSecretMaterial(result)) {
    throw new Error("The result was withheld because it contained credential-like material.");
  }
  return result;
}

function artifactRoot() {
  return process.env.NEGRONI_ARTIFACT_ROOT
    ? resolve(process.env.NEGRONI_ARTIFACT_ROOT)
    : resolve(homedir(), "Documents/tools-negroni");
}

function inside(path, parent) {
  const difference = relative(parent, path);
  return difference === "" || (!difference.startsWith(`..${sep}`) && difference !== "..");
}

async function capabilityStatus(args) {
  exactObject(args, []);
  let version = "unknown";
  try {
    const manifest = JSON.parse(await readFile(resolve(pluginRoot, ".codex-plugin/plugin.json"), "utf8"));
    if (typeof manifest.version === "string") version = manifest.version;
  } catch {
    // Version discovery is informative and must not make the MCP unhealthy.
  }
  return {
    contract: "negroni-capability-receipt",
    contract_version: "1.0",
    plugin_version: version,
    dry_run_default: true,
    hosted_site: {
      state: "configured_not_runtime_verified",
    },
    competitor_research: {
      state: "locally_available",
      normalized_import: process.env.NEGRONI_TEST_MODE === "1" ? "sanitized_fixture_only" : "not_configured",
      official_meta_api: "blocked_pending_authorization_and_coverage_proof",
      official_meta_api_scope: {
        ordinary_non_eu_commercial: "unsupported",
        eligible_scopes: "blocked_pending_authorization_and_coverage_proof",
        max_page_ids_per_request: 10,
      },
    },
    secure_research_runner: { state: "locally_verified_not_deployed" },
    learning_core: { state: "locally_available", authority: "sqlite", full_text: "fts5", vector_index: "rebuildable" },
    draper: { state: "locally_available", query_boundary: "validated_intents_only", arbitrary_sql: false },
    google_drive: { state: "blocked_pending_verified_owner_oauth" },
    scheduler: { state: "inactive" },
    prohibited_actions: ["publish", "spend", "launch_traffic", "mutate_ad_account", "activate_scheduler"],
  };
}

async function invokeDraperCli(command, input = null) {
  return new Promise((resolveResult, rejectResult) => {
    const child = spawn(process.execPath, [cliPath, "draper", command, "--json"], {
      cwd: pluginRoot,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stdoutTooLarge = false;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (stdout.length + chunk.length > MAX_OUTPUT_BYTES) {
        stdoutTooLarge = true;
        child.kill("SIGTERM");
        return;
      }
      stdout += chunk;
    });
    child.stderr.resume();
    const timer = setTimeout(() => child.kill("SIGTERM"), 30_000);
    child.once("error", () => rejectResult(new Error("The stable Draper command could not be started.")));
    child.once("close", (code) => {
      clearTimeout(timer);
      if (stdoutTooLarge) return rejectResult(new Error("The stable Draper result exceeded its bounded size."));
      if (code !== 0) return rejectResult(new Error("The stable Draper command rejected the request."));
      try {
        resolveResult(safeResult(JSON.parse(stdout.trim())));
      } catch {
        rejectResult(new Error("The stable Draper command returned an invalid bounded receipt."));
      }
    });
    child.stdin.end(input === null ? "" : `${JSON.stringify(input)}\n`);
  });
}

async function learningCoreStatus(args) {
  exactObject(args, []);
  return invokeDraperCli("status");
}

async function draperQuery(args) {
  const input = exactObject(args, ["scope", "intent", "question", "query", "ad_ids", "token_budget"], ["scope", "intent", "question"]);
  if (typeof input.intent !== "string" || !DRAPER_INTENTS.has(input.intent)) throw new Error("intent is not supported.");
  const normalized = {
    scope: stableScope(input.scope),
    intent: input.intent,
    question: boundedText(input.question, "question", 1_000),
    ...(input.query === undefined ? {} : { query: boundedText(input.query, "query", 500) }),
    ...(input.ad_ids === undefined ? {} : {
      ad_ids: (() => {
        if (!Array.isArray(input.ad_ids) || input.ad_ids.length > 10) throw new Error("ad_ids must contain at most 10 IDs.");
        return [...new Set(input.ad_ids.map((id) => stableId(id, "ad_id")))];
      })(),
    }),
    token_budget: input.token_budget === undefined ? 800 : input.token_budget,
  };
  if (!Number.isInteger(normalized.token_budget) || normalized.token_budget < 64 || normalized.token_budget > 4_000) {
    throw new Error("token_budget must be an integer from 64 through 4000.");
  }
  safeDraperInput(normalized);
  return invokeDraperCli("query", normalized);
}

async function draperRecordDecision(args) {
  const input = exactObject(args, [
    "scope", "proposal_id", "proposal_hash", "decision", "approved_by", "rationale", "decided_at",
  ], ["scope", "proposal_id", "proposal_hash", "decision", "approved_by", "rationale", "decided_at"]);
  if (typeof input.proposal_hash !== "string" || !SHA256_PATTERN.test(input.proposal_hash)) {
    throw new Error("proposal_hash must be a SHA-256 value.");
  }
  if (input.decision !== "approved" && input.decision !== "rejected") throw new Error("decision is invalid.");
  if (typeof input.decided_at !== "string" || Number.isNaN(Date.parse(input.decided_at))) {
    throw new Error("decided_at must be an ISO-8601 timestamp.");
  }
  const normalized = {
    scope: stableScope(input.scope),
    proposal_id: stableId(input.proposal_id, "proposal_id"),
    proposal_hash: input.proposal_hash,
    decision: input.decision,
    approved_by: stableId(input.approved_by, "approved_by"),
    rationale: boundedText(input.rationale, "rationale", 2_000),
    decided_at: input.decided_at,
  };
  safeDraperInput(normalized);
  return invokeDraperCli("record-decision", normalized);
}

async function invokeStableCli({ project, resumeRun, provider, dryRun, deadlineSeconds }) {
  const argv = [
    cliPath,
    "research", "competitors", "run",
    "--project", project,
    "--mode", "nightly",
    "--deadline-seconds", String(deadlineSeconds),
    "--json",
  ];
  if (resumeRun) argv.push("--resume-run", resumeRun);
  if (provider) argv.push("--provider", provider);
  if (dryRun) argv.push("--dry-run");

  const result = await new Promise((resolveResult, rejectResult) => {
    const child = spawn(process.execPath, argv, {
      cwd: pluginRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stdoutTooLarge = false;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (stdout.length + chunk.length > MAX_OUTPUT_BYTES) {
        stdoutTooLarge = true;
        child.kill("SIGTERM");
        return;
      }
      stdout += chunk;
    });
    child.stderr.resume();
    const timer = setTimeout(() => child.kill("SIGTERM"), (deadlineSeconds + 15) * 1000);
    child.once("error", () => rejectResult(new Error("The stable competitor command could not be started.")));
    child.once("close", (code) => {
      clearTimeout(timer);
      if (stdoutTooLarge) return rejectResult(new Error("The stable competitor result exceeded its bounded size."));
      try {
        const receipt = JSON.parse(stdout.trim());
        resolveResult({ exit_code: code ?? 5, ...safeResult(receipt) });
      } catch {
        rejectResult(new Error("The stable competitor command returned an invalid bounded receipt."));
      }
    });
  });
  return result;
}

async function competitorResearch(args) {
  const input = exactObject(args, ["project", "dry_run", "provider", "deadline_seconds"], ["project"]);
  const provider = input.provider;
  if (provider !== undefined
    && provider !== "normalized_import"
    && provider !== "official_meta_api") {
    throw new Error("provider is not supported.");
  }
  return invokeStableCli({
    project: stableId(input.project, "project"),
    resumeRun: null,
    provider,
    dryRun: dryRunDefault(input.dry_run),
    deadlineSeconds: boundedDeadline(input.deadline_seconds),
  });
}

async function resumeCompetitorResearch(args) {
  const input = exactObject(args, ["project", "run_id", "dry_run", "deadline_seconds"], ["project", "run_id"]);
  return invokeStableCli({
    project: stableId(input.project, "project"),
    resumeRun: stableId(input.run_id, "run_id"),
    provider: null,
    dryRun: dryRunDefault(input.dry_run),
    deadlineSeconds: boundedDeadline(input.deadline_seconds),
  });
}

async function inspectResearchArtifact(args) {
  const input = exactObject(args, ["project", "run_id", "revision", "artifact"], ["project", "run_id", "revision", "artifact"]);
  const project = stableId(input.project, "project");
  const runId = stableId(input.run_id, "run_id");
  if (!Number.isInteger(input.revision) || input.revision < 1 || input.revision > 999) {
    throw new Error("revision must be an integer from 1 through 999.");
  }
  if (typeof input.artifact !== "string" || !ARTIFACTS.has(input.artifact)) {
    throw new Error("artifact is not one of the canonical immutable Research files.");
  }
  const root = artifactRoot();
  const revision = `revision-${String(input.revision).padStart(3, "0")}`;
  const path = resolve(root, "research/competitor-research", project, runId, revision, input.artifact);
  if (!inside(path, root)) throw new Error("Artifact routing escaped the durable Research root.");
  const details = await lstat(path);
  if (!details.isFile() || details.isSymbolicLink() || details.size > MAX_OUTPUT_BYTES) {
    throw new Error("The requested artifact is not a bounded immutable file.");
  }
  const resolvedRoot = await realpath(root);
  const resolvedPath = await realpath(path);
  if (!inside(resolvedPath, resolvedRoot)) throw new Error("Artifact routing escaped the durable Research root.");
  const contents = await readFile(resolvedPath);
  const result = {
    contract: "negroni-artifact-inspection",
    contract_version: "1.0",
    project_id: project,
    run_id: runId,
    revision: input.revision,
    artifact: input.artifact,
    sha256: createHash("sha256").update(contents).digest("hex"),
    byte_size: contents.byteLength,
    verified: true,
  };
  if (input.artifact === "collection-receipt.json") {
    result.receipt = safeResult(JSON.parse(contents.toString("utf8")));
  }
  return result;
}

async function callTool(name, args) {
  if (name === "capability_status") return capabilityStatus(args ?? {});
  if (name === "learning_core_status") return learningCoreStatus(args ?? {});
  if (name === "draper_query") return draperQuery(args ?? {});
  if (name === "draper_record_decision") return draperRecordDecision(args ?? {});
  if (name === "competitor_research") return competitorResearch(args ?? {});
  if (name === "resume_competitor_research") return resumeCompetitorResearch(args ?? {});
  if (name === "inspect_research_artifact") return inspectResearchArtifact(args ?? {});
  throw new Error("Unknown Negroni tool.");
}

const write = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const readline = createInterface({ input: process.stdin, terminal: false });
const pendingCalls = new Set();

readline.on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (!message || typeof message !== "object" || message.id === undefined || message.id === null) return;
  if (message.method === "initialize") {
    write({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: message.params?.protocolVersion ?? "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "negroni", version: "1.0.0" },
        instructions: "Negroni's local tool boundary is dry-run by default and cannot publish, spend, launch traffic, mutate an ad account, or activate a scheduler.",
      },
    });
    return;
  }
  if (message.method === "tools/list") {
    write({ jsonrpc: "2.0", id: message.id, result: { tools: TOOLS } });
    return;
  }
  if (message.method === "ping") {
    write({ jsonrpc: "2.0", id: message.id, result: {} });
    return;
  }
  if (message.method === "prompts/list") {
    write({ jsonrpc: "2.0", id: message.id, result: { prompts: [] } });
    return;
  }
  if (message.method === "resources/list") {
    write({ jsonrpc: "2.0", id: message.id, result: { resources: [] } });
    return;
  }
  if (message.method !== "tools/call") {
    write({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not supported." } });
    return;
  }
  const pending = (async () => {
    try {
      const result = await callTool(message.params?.name, message.params?.arguments);
      write({
        jsonrpc: "2.0",
        id: message.id,
        result: { content: [{ type: "text", text: JSON.stringify(safeResult(result)) }] },
      });
    } catch (error) {
      write({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          content: [{ type: "text", text: redactString(error instanceof Error ? error.message : "Negroni tool failed.").slice(0, 400) }],
          isError: true,
        },
      });
    }
  })();
  pendingCalls.add(pending);
  pending.finally(() => pendingCalls.delete(pending));
});

readline.on("close", async () => {
  await Promise.allSettled([...pendingCalls]);
  process.exit(0);
});
