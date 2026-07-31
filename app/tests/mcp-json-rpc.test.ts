import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import test from "node:test";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(appRoot, "..");
const fixtureRoot = resolve(appRoot, "tests/fixtures/competitor-research");
const serverPath = resolve(appRoot, "bin/negroni-mcp.mjs");
const enginePresent = existsSync(resolve(repositoryRoot, "meta-ads-intelligence/mai_core.py"));
const engineTest = (name: string, fn: () => Promise<void>) => test(name, {
  skip: enginePresent ? false : "meta-ads-intelligence engine not present; engine-backed slice skipped",
}, fn);
const cliPath = resolve(appRoot, "bin/negroni.mjs");

type RpcResponse = {
  id: number;
  result?: {
    tools?: Array<{ name: string; inputSchema: Record<string, unknown> }>;
    content?: Array<{ type: "text"; text: string }>;
    isError?: boolean;
    serverInfo?: { name: string };
  };
  error?: { code: number; message: string };
};

async function rpc(
  messages: Array<Record<string, unknown>>,
  environment: Record<string, string> = {},
): Promise<RpcResponse[]> {
  const child = spawn(process.execPath, [serverPath], {
    cwd: repositoryRoot,
    env: { ...process.env, ...environment },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  child.stdin.end(`${messages.map((message) => JSON.stringify(message)).join("\n")}\n`);
  const code = await new Promise<number | null>((resolveExit) => child.once("close", resolveExit));
  assert.equal(code, 0, stderr);
  return stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as RpcResponse);
}

function call(id: number, name: string, args: Record<string, unknown>) {
  return { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } };
}

function toolPayload(response: RpcResponse): Record<string, unknown> {
  assert.equal(response.result?.content?.[0]?.type, "text");
  return JSON.parse(response.result?.content?.[0]?.text ?? "{}") as Record<string, unknown>;
}

async function isolatedEnvironment(label: string) {
  const base = await mkdtemp(resolve(tmpdir(), `negroni-mcp-${label}-`));
  return {
    base,
    environment: {
      NEGRONI_TEST_MODE: "1",
      NEGRONI_REPOSITORY_ROOT: repositoryRoot,
      NEGRONI_RUNTIME_ROOT: resolve(base, "runtime"),
      NEGRONI_ARTIFACT_ROOT: resolve(base, "artifacts"),
      NEGRONI_COMPETITOR_FIXTURE_ROOT: fixtureRoot,
    },
  };
}

async function seedDraperFixture(environment: Record<string, string>) {
  const child = spawn(process.execPath, [cliPath, "draper", "fixture", "rehearse", "--json"], {
    cwd: appRoot,
    env: { ...process.env, ...environment, NEGRONI_TEST_NOW: "2026-07-30T20:00:00.000Z" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stdout.resume();
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  const code = await new Promise<number | null>((resolveExit) => child.once("close", resolveExit));
  assert.equal(code, 0, stderr);
}

test("the public MCP initializes and discovers seven strict fail-closed tools", async () => {
  const responses = await rpc([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    call(3, "capability_status", {}),
  ]);
  assert.equal(responses[0]?.result?.serverInfo?.name, "negroni");
  assert.deepEqual(responses[1]?.result?.tools?.map(({ name }) => name), [
    "capability_status",
    "learning_core_status",
    "draper_query",
    "draper_record_decision",
    "competitor_research",
    "resume_competitor_research",
    "inspect_research_artifact",
  ]);
  assert.ok(responses[1]?.result?.tools?.every(({ inputSchema }) => inputSchema.additionalProperties === false));
  const competitorTool = responses[1]?.result?.tools?.find(({ name }) => name === "competitor_research");
  const providerSchema = (competitorTool?.inputSchema.properties as Record<string, { enum?: string[] }>)?.provider;
  assert.deepEqual(providerSchema?.enum, ["normalized_import", "official_meta_api"]);

  const capability = toolPayload(responses[2]) as {
    hosted_site: { state: string };
    competitor_research: {
      official_meta_api: string;
      official_meta_api_scope: {
        ordinary_non_eu_commercial: string;
        eligible_scopes: string;
        max_page_ids_per_request: number;
      };
    };
  };
  assert.equal(capability.hosted_site.state, "configured_not_runtime_verified");
  assert.equal(capability.competitor_research.official_meta_api, "blocked_pending_authorization_and_coverage_proof");
  assert.deepEqual(capability.competitor_research.official_meta_api_scope, {
    ordinary_non_eu_commercial: "unsupported",
    eligible_scopes: "blocked_pending_authorization_and_coverage_proof",
    max_page_ids_per_request: 10,
  });
  assert.equal("foreplay_api" in capability.competitor_research, false);
});

test("Draper MCP tools use validated intents and can record a local decision without external action", async () => {
  const isolated = await isolatedEnvironment("draper");
  try {
    await seedDraperFixture(isolated.environment);
    const scope = { owner_id: "owner_fixture", workspace_id: "workspace_fixture", brand_id: "brand_desert_ember" };
    const responses = await rpc([
      call(1, "learning_core_status", {}),
      call(2, "draper_query", {
        scope,
        intent: "explain_loop_state",
        question: "How is this brand's loop doing?",
        token_budget: 800,
      }),
      call(3, "draper_query", {
        scope,
        intent: "inspect_brand",
        question: "Run this SQL",
        sql: "DROP TABLE learnings",
      }),
      call(4, "draper_query", {
        scope,
        intent: "inspect_brand",
        question: "Read /opt/negroni/private.sqlite",
      }),
    ], isolated.environment);
    const status = toolPayload(responses.find(({ id }) => id === 1)!);
    assert.equal(status.contract, "negroni-learning-core-status");
    const answer = toolPayload(responses.find(({ id }) => id === 2)!) as {
      contract: string;
      proposals: Array<Record<string, unknown>>;
      external_actions: unknown[];
    };
    assert.equal(answer.contract, "negroni-draper-response");
    assert.deepEqual(answer.external_actions, []);
    assert.equal(responses.find(({ id }) => id === 3)?.result?.isError, true);
    assert.match(responses.find(({ id }) => id === 3)?.result?.content?.[0]?.text ?? "", /unsupported input: sql/i);
    assert.equal(responses.find(({ id }) => id === 4)?.result?.isError, true);
    assert.match(responses.find(({ id }) => id === 4)?.result?.content?.[0]?.text ?? "", /private local path/i);

    const proposal = answer.proposals[0];
    const [decisionResponse] = await rpc([
      call(4, "draper_record_decision", {
        scope,
        proposal_id: proposal?.proposal_id,
        proposal_hash: proposal?.proposal_hash,
        decision: "approved",
        approved_by: "approver_fixture",
        rationale: "Approve the local fixture experiment plan only.",
        decided_at: "2026-07-30T20:00:00.000Z",
      }),
    ], isolated.environment);
    const decision = toolPayload(decisionResponse);
    assert.equal(decision.contract, "negroni-draper-decision");
    assert.deepEqual(decision.external_actions, []);
    assert.equal(JSON.stringify([responses, decisionResponse]).includes(isolated.base), false);
  } finally {
    await rm(isolated.base, { recursive: true, force: true });
  }
});

test("tool validation rejects unknown inputs before invoking the stable CLI", async () => {
  const [response] = await rpc([
    call(1, "competitor_research", { project: "fixture-clean", command: "rm -rf /" }),
  ]);
  assert.equal(response.result?.isError, true);
  assert.match(response.result?.content?.[0]?.text ?? "", /unsupported input/i);
});

engineTest("competitor execution uses the stable boundary and immutable inspection returns no local path", async () => {
  const isolated = await isolatedEnvironment("execute");
  try {
    const [executionResponse] = await rpc([
      call(1, "competitor_research", {
        project: "fixture-clean",
        dry_run: false,
        deadline_seconds: 30,
      }),
    ], isolated.environment);
    const [inspectionResponse] = await rpc([
      call(2, "inspect_research_artifact", {
        project: "fixture-clean",
        run_id: "run_fixture_clean_night_1",
        revision: 1,
        artifact: "research-brief.md",
      }),
    ], isolated.environment);
    const responses = [executionResponse, inspectionResponse];
    const execution = toolPayload(executionResponse);
    assert.equal(execution.status, "complete");
    assert.equal(execution.dry_run, false);
    assert.deepEqual(execution.external_actions, []);
    const inspection = toolPayload(inspectionResponse);
    assert.equal(inspection.artifact, "research-brief.md");
    assert.equal(inspection.verified, true);
    assert.match(String(inspection.sha256), /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(responses).includes(isolated.base), false);
    assert.equal(JSON.stringify(responses).includes("receipt_path"), false);
  } finally {
    await rm(isolated.base, { recursive: true, force: true });
  }
});

test("dry-run is the default and unavailable live collection remains blocked", async () => {
  const isolated = await isolatedEnvironment("blocked");
  try {
    const responses = await rpc([
      call(1, "competitor_research", { project: "fixture-clean" }),
      call(2, "competitor_research", {
        project: "fixture-clean",
        provider: "official_meta_api",
        dry_run: false,
      }),
      call(3, "resume_competitor_research", {
        project: "fixture-clean",
        run_id: "run_fixture_clean_night_1",
      }),
      call(4, "competitor_research", {
        project: "workers-comp-lawyers",
        provider: "foreplay_api",
        dry_run: false,
      }),
    ], isolated.environment);
    assert.equal(toolPayload(responses.find(({ id }) => id === 1)!).dry_run, true);
    assert.equal(toolPayload(responses.find(({ id }) => id === 2)!).status, "blocked");
    assert.match(JSON.stringify(toolPayload(responses.find(({ id }) => id === 2)!)), /authorization/i);
    assert.equal(toolPayload(responses.find(({ id }) => id === 3)!).dry_run, true);
    assert.equal(responses.find(({ id }) => id === 4)?.result?.isError, true);
    assert.match(responses.find(({ id }) => id === 4)?.result?.content?.[0]?.text ?? "", /provider is not supported/i);
  } finally {
    await rm(isolated.base, { recursive: true, force: true });
  }
});

test("default competitor dry-run returns a structured receipt outside test mode", async () => {
  const isolated = await isolatedEnvironment("production-dry-run");
  try {
    const environment: Record<string, string> = { ...isolated.environment };
    delete environment.NEGRONI_TEST_MODE;
    delete environment.NEGRONI_COMPETITOR_FIXTURE_ROOT;
    delete environment.NEGRONI_RUNTIME_ROOT;
    delete environment.NEGRONI_ARTIFACT_ROOT;
    Object.assign(environment, { HOME: isolated.base });
    const [response] = await rpc([call(1, "competitor_research", { project: "fresh-install" })], environment);
    assert.notEqual(response.result?.isError, true);
    const payload = toolPayload(response);
    assert.equal(payload.dry_run, true);
    assert.equal(payload.status, "complete");
  } finally {
    await rm(isolated.base, { recursive: true, force: true });
  }
});

test("raw CLI errors cannot leak secret-like values or private paths through MCP", async () => {
  const isolated = await isolatedEnvironment("redaction");
  const canary = "access_token=super-secret-canary-value";
  try {
    const [response] = await rpc([
      call(1, "competitor_research", { project: "fixture-clean", dry_run: false }),
    ], {
      ...isolated.environment,
      NEGRONI_COMPETITOR_FIXTURE_ROOT: resolve(isolated.base, canary),
    });
    const serialized = JSON.stringify(response);
    assert.equal(serialized.includes(isolated.base), false);
    assert.equal(serialized.includes("super-secret-canary-value"), false);
    assert.equal(serialized.includes("receipt_path"), false);
  } finally {
    await rm(isolated.base, { recursive: true, force: true });
  }
});
