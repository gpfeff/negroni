import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

const appRoot = resolve(import.meta.dirname, "..");
const cli = resolve(appRoot, "bin/negroni.mjs");

async function runCli(
  args: string[],
  environment: Record<string, string>,
  input?: Record<string, unknown>,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, [cli, ...args], {
    cwd: appRoot,
    env: { ...process.env, ...environment },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  child.stdin.end(input ? `${JSON.stringify(input)}\n` : "");
  const code = await new Promise<number | null>((resolveExit) => child.once("close", resolveExit));
  return { code, stdout, stderr };
}

test("the stable CLI rehearses, inspects, and queries Draper without external action or private-path output", async () => {
  const runtimeRoot = await mkdtemp(resolve(tmpdir(), "negroni-draper-cli-"));
  const environment = {
    NEGRONI_TEST_MODE: "1",
    NEGRONI_TEST_NOW: "2026-07-30T20:00:00.000Z",
    NEGRONI_RUNTIME_ROOT: runtimeRoot,
  };
  try {
    const rehearsalRun = await runCli(["draper", "fixture", "rehearse", "--json"], environment);
    assert.equal(rehearsalRun.code, 0, rehearsalRun.stderr);
    const rehearsal = JSON.parse(rehearsalRun.stdout) as Record<string, unknown>;
    assert.equal(rehearsal.contract, "negroni-draper-rehearsal");
    assert.deepEqual(rehearsal.external_actions, []);

    const statusRun = await runCli(["draper", "status", "--json"], environment);
    assert.equal(statusRun.code, 0, statusRun.stderr);
    const status = JSON.parse(statusRun.stdout) as { counts: { brands: number; learnings: number } };
    assert.equal(status.counts.brands, 1);
    assert.equal(status.counts.learnings, 1);

    const queryRun = await runCli(["draper", "query", "--json"], environment, {
      scope: { owner_id: "owner_fixture", workspace_id: "workspace_fixture", brand_id: "brand_desert_ember" },
      intent: "explain_loop_state",
      question: "How is this brand's loop doing?",
      token_budget: 800,
    });
    assert.equal(queryRun.code, 0, queryRun.stderr);
    const response = JSON.parse(queryRun.stdout) as { contract: string; external_actions: unknown[] };
    assert.equal(response.contract, "negroni-draper-response");
    assert.deepEqual(response.external_actions, []);
    assert.equal(`${rehearsalRun.stdout}${statusRun.stdout}${queryRun.stdout}`.includes(runtimeRoot), false);
  } finally {
    await rm(runtimeRoot, { recursive: true, force: true });
  }
});
