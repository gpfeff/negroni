import assert from "node:assert/strict";
import { lstat, mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { spawn, spawnSync } from "node:child_process";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(appRoot, "..");
const fixtureRoot = resolve(appRoot, "tests/fixtures/competitor-research");
const cli = resolve(appRoot, "bin/negroni.mjs");

type CliResult = {
  code: number;
  stderr: string;
  receipt: {
    status: string;
    run_id: string;
    receipt_sha256: string;
    receipt_path: string;
    receipt_revision: number;
    error_code?: string;
    error?: string;
    idempotent: boolean;
    idempotent_replay: boolean;
    resume_command: string;
    limitations: string[];
    provider: string;
    engine: { database_sha256: string; counts: Record<string, number> };
    ads: Array<{ public_ad_id: string; lifecycle_status: string }>;
    winner_signals: Array<{ score_version: string }>;
    artifact_receipts: Array<{ verified: boolean; sha256: string }>;
    google: { outbox: Record<string, number>; readback_verified: boolean };
    enrichment: { failed: number };
  };
};

function runCli(
  roots: { runtime: string; artifacts: string },
  project: string,
  extra: string[] = [],
  environment: Record<string, string> = {},
): CliResult {
  const result = spawnSync(process.execPath, [
    cli, "research", "competitors", "run",
    "--project", project,
    "--mode", "nightly",
    "--deadline-seconds", "30",
    "--json",
    ...extra,
  ], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      NEGRONI_TEST_MODE: "1",
      NEGRONI_REPOSITORY_ROOT: repositoryRoot,
      NEGRONI_RUNTIME_ROOT: roots.runtime,
      NEGRONI_ARTIFACT_ROOT: roots.artifacts,
      NEGRONI_COMPETITOR_FIXTURE_ROOT: fixtureRoot,
      ...environment,
    },
    timeout: 30_000,
  });
  assert.notEqual(result.signal, "SIGTERM", result.stderr);
  return {
    code: result.status ?? 5,
    stderr: result.stderr,
    receipt: result.stdout.trim() ? JSON.parse(result.stdout) : {},
  };
}

async function roots(label: string) {
  const base = await mkdtemp(resolve(tmpdir(), `negroni-${label}-`));
  return { base, runtime: resolve(base, "runtime"), artifacts: resolve(base, "artifacts") };
}

test("the stable CLI processes two fixture nights and then returns an idempotent receipt", async () => {
  const isolated = await roots("competitor-clean");
  const first = runCli(isolated, "fixture-clean");
  assert.equal(first.code, 0, first.stderr);
  assert.equal(first.receipt.status, "complete");
  assert.equal(first.receipt.run_id, "run_fixture_clean_night_1");
  assert.deepEqual(first.receipt.engine.counts, {
    ads: 2,
    content_versions: 2,
    observations: 2,
    present_observations: 2,
    absent_observations: 0,
    media_objects: 1,
    creative_families: 1,
    family_members: 2,
    nightly_runs: 1,
    watch_runs: 1,
  });

  const second = runCli(isolated, "fixture-clean");
  assert.equal(second.code, 0, second.stderr);
  assert.equal(second.receipt.run_id, "run_fixture_clean_night_2");
  assert.equal(second.receipt.engine.counts.observations, 4);
  assert.equal(second.receipt.engine.counts.absent_observations, 1);
  assert.equal(second.receipt.engine.counts.content_versions, 3);
  assert.equal(second.receipt.engine.counts.media_objects, 1);
  assert.equal(second.receipt.engine.counts.creative_families, 1);
  assert.equal(second.receipt.ads.find((ad) => ad.public_ad_id === "910000000000002")?.lifecycle_status, "possibly_inactive");
  assert.equal(second.receipt.winner_signals.every((signal) => signal.score_version === "public-winner-signal-v2"), true);
  assert.equal(second.receipt.artifact_receipts.length, 5);
  assert.equal(second.receipt.artifact_receipts.every((item) => item.verified && /^[a-f0-9]{64}$/.test(item.sha256)), true);

  const repeat = runCli(isolated, "fixture-clean");
  assert.equal(repeat.code, 0, repeat.stderr);
  assert.equal(repeat.receipt.run_id, second.receipt.run_id);
  assert.equal(repeat.receipt.receipt_sha256, second.receipt.receipt_sha256);
  assert.equal(repeat.receipt.engine.database_sha256, second.receipt.engine.database_sha256);
  assert.equal(repeat.receipt.idempotent_replay, true);
});

test("a fake Google failure preserves a partial receipt and resumes without duplicates", async () => {
  const isolated = await roots("competitor-recovery");
  assert.equal(runCli(isolated, "fixture-recovery").code, 0);
  const partial = runCli(isolated, "fixture-recovery");
  assert.equal(partial.code, 3, partial.stderr);
  assert.equal(partial.receipt.status, "partial");
  assert.equal(partial.receipt.run_id, "run_fixture_recovery_night_2");
  assert.equal(partial.receipt.google.outbox.drive_uploaded, 1);
  assert.equal(partial.receipt.google.readback_verified, false);
  assert.match(partial.receipt.resume_command, /--resume-run run_fixture_recovery_night_2/);
  assert.equal(partial.receipt.enrichment.failed, 1);
  const partialReceiptText = await readFile(partial.receipt.receipt_path, "utf8");

  const resumed = runCli(isolated, "fixture-recovery", ["--resume-run", partial.receipt.run_id]);
  assert.equal(resumed.code, 0, resumed.stderr);
  assert.equal(resumed.receipt.status, "complete");
  assert.equal(resumed.receipt.receipt_revision, 2);
  assert.equal(resumed.receipt.engine.counts.observations, partial.receipt.engine.counts.observations);
  assert.equal(resumed.receipt.engine.counts.content_versions, partial.receipt.engine.counts.content_versions);
  assert.equal(resumed.receipt.engine.counts.media_objects, partial.receipt.engine.counts.media_objects);
  assert.equal(resumed.receipt.google.outbox.complete >= 1, true);
  assert.equal(resumed.receipt.google.readback_verified, true);
  assert.equal(resumed.receipt.enrichment.failed, 0);
  assert.equal(await readFile(partial.receipt.receipt_path, "utf8"), partialReceiptText);
  assert.notEqual(resumed.receipt.receipt_path, partial.receipt.receipt_path);
});

test("overlap and unavailable live providers fail honestly without engine or external mutation", async () => {
  const isolated = await roots("competitor-blocked");
  const projectRuntime = resolve(isolated.runtime, "competitor-research/projects/fixture-clean");
  await mkdir(projectRuntime, { recursive: true });
  await writeFile(resolve(projectRuntime, ".nightly.lock"), "held by fixture test\n", { flag: "wx" });
  const overlap = runCli(isolated, "fixture-clean");
  assert.equal(overlap.code, 4, overlap.stderr);
  assert.equal(overlap.receipt.status, "skipped");
  assert.match(overlap.receipt.limitations.join(" "), /overlap/i);

  const blockedRoots = await roots("competitor-provider");
  const blocked = runCli(blockedRoots, "fixture-clean", ["--provider", "official_meta_api"]);
  assert.equal(blocked.code, 4, blocked.stderr);
  assert.equal(blocked.receipt.status, "blocked");
  assert.match(blocked.receipt.limitations.join(" "), /live provider proof and authorization/i);

  const foreplayRoots = await roots("competitor-foreplay-provider");
  const foreplay = runCli(foreplayRoots, "fixture-clean", ["--provider", "foreplay_api"]);
  assert.equal(foreplay.code, 64, foreplay.stderr);
  assert.equal(foreplay.receipt.status, "failed");
  assert.equal(foreplay.receipt.error_code, "invalid_cli");
  assert.match(foreplay.receipt.error ?? "", /not configured or supported/i);
});

test("an engine failure persists a bounded durable receipt and releases the profile lock", async () => {
  const isolated = await roots("competitor-engine-failure");
  const missingRepository = resolve(isolated.base, "repository-without-engine");
  await mkdir(missingRepository, { recursive: true });

  const failed = runCli(isolated, "fixture-clean", [], {
    NEGRONI_REPOSITORY_ROOT: missingRepository,
  });

  assert.equal(failed.code, 5, failed.stderr);
  assert.equal(failed.receipt.status, "failed");
  assert.match(failed.receipt.resume_command, /--project fixture-clean --mode nightly/);
  assert.match(failed.receipt.receipt_sha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.parse(await readFile(failed.receipt.receipt_path, "utf8")).receipt_sha256, failed.receipt.receipt_sha256);
  const projectRuntime = resolve(isolated.runtime, "competitor-research/projects/fixture-clean");
  await assert.rejects(lstat(resolve(projectRuntime, ".nightly.lock")), /ENOENT/);
  const checkpoint = JSON.parse(await readFile(resolve(projectRuntime, "runs/run_fixture_clean_night_1/checkpoint.json"), "utf8"));
  assert.equal(checkpoint.status, "failed");
  assert.equal(checkpoint.external_actions.length, 0);
});

test("SIGTERM persists a resumable partial receipt, releases the lock, and resumes without duplicates", async () => {
  const isolated = await roots("competitor-sigterm");
  const runningReceipt = resolve(
    isolated.artifacts,
    "research/competitor-research/fixture-clean/run_fixture_clean_night_1/attempt-001/running-receipt.json",
  );
  const child = spawn(process.execPath, [
    cli, "research", "competitors", "run",
    "--project", "fixture-clean",
    "--mode", "nightly",
    "--deadline-seconds", "30",
    "--json",
  ], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      NEGRONI_TEST_MODE: "1",
      NEGRONI_TEST_PAUSE_AFTER_RUNNING_MS: "5000",
      NEGRONI_REPOSITORY_ROOT: repositoryRoot,
      NEGRONI_RUNTIME_ROOT: isolated.runtime,
      NEGRONI_ARTIFACT_ROOT: isolated.artifacts,
      NEGRONI_COMPETITOR_FIXTURE_ROOT: fixtureRoot,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });

  let observedRunningReceipt = false;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      await lstat(runningReceipt);
      observedRunningReceipt = true;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
    }
  }
  assert.equal(observedRunningReceipt, true, "running receipt was not durably visible before collection");
  assert.equal(child.kill("SIGTERM"), true);
  const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolveExit) => {
    child.once("close", (code, signal) => resolveExit({ code, signal }));
  });

  assert.equal(result.signal, null, stderr);
  assert.equal(result.code, 3, stderr);
  const interrupted = JSON.parse(stdout.trim()) as CliResult["receipt"];
  assert.equal(interrupted.status, "partial");
  assert.match(interrupted.resume_command, /--resume-run run_fixture_clean_night_1/);
  assert.equal(JSON.parse(await readFile(interrupted.receipt_path, "utf8")).receipt_sha256, interrupted.receipt_sha256);
  const projectRuntime = resolve(isolated.runtime, "competitor-research/projects/fixture-clean");
  await assert.rejects(lstat(resolve(projectRuntime, ".nightly.lock")), /ENOENT/);

  const resumed = runCli(isolated, "fixture-clean", ["--resume-run", "run_fixture_clean_night_1"]);
  assert.equal(resumed.code, 0, resumed.stderr);
  assert.equal(resumed.receipt.engine.counts.observations, 2);
  assert.equal(resumed.receipt.engine.counts.content_versions, 2);
  assert.equal(resumed.receipt.engine.counts.media_objects, 1);
});

test("runtime SQLite and media never leak into Git or durable artifact roots", async () => {
  const isolated = await roots("competitor-routing");
  assert.equal(runCli(isolated, "fixture-clean").code, 0);
  async function findPrivate(root: string): Promise<string[]> {
    const found: string[] = [];
    async function walk(path: string): Promise<void> {
      for (const name of await readdir(path)) {
        const child = resolve(path, name);
        const details = await lstat(child);
        if (details.isSymbolicLink()) continue;
        if (details.isDirectory()) await walk(child);
        else if (name === "meta-ads.sqlite3" || name === "meta-ads.sqlite3-wal" || name === "meta-ads.sqlite3-shm") found.push(child);
      }
    }
    await walk(root);
    return found;
  }
  assert.deepEqual(await findPrivate(isolated.artifacts), []);
  assert.equal((await findPrivate(isolated.runtime)).length, 1);
  assert.deepEqual(await findPrivate(repositoryRoot), []);
});
