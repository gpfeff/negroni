import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const appRoot = resolve(import.meta.dirname, "..");
const doctorPath = join(appRoot, "scripts", "local-doctor.mjs");
const brokerPath = join(appRoot, "scripts", "local-broker.mjs");
const launcherPath = join(appRoot, "bin", "negroni.mjs");
const canary = "local-bridge-test-access-token";

async function createCommandStubs() {
  const directory = await mkdtemp(join(tmpdir(), "negroni-local-bridge-"));
  for (const command of ["codex", "claude", "gcloud"]) {
    const path = join(directory, command);
    await writeFile(path, `#!/bin/sh\nprintf '%s\\n' '${canary}'\n`, { mode: 0o700 });
    await chmod(path, 0o700);
  }
  return directory;
}

async function unusedPort() {
  const server = createServer();
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const { port } = address;
  await new Promise<void>((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
  return port;
}

async function waitForStatus(port: number, token: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/providers/status`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (response.ok) return response;
    } catch {
      // The bridge may not have bound the loopback port yet.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  throw new Error("The local credential bridge did not become ready.");
}

test("local doctor reports readiness without echoing command output", async () => {
  const stubs = await createCommandStubs();
  try {
    const { stdout } = await execFileAsync(process.execPath, [doctorPath], {
      env: { ...process.env, PATH: stubs },
    });
    assert.equal(stdout.includes(canary), false);
    assert.match(stdout, /Application Default Credentials are available/);
  } finally {
    await rm(stubs, { recursive: true, force: true });
  }
});

test("local launcher reserves port 3000 unless a Negroni-specific override is set", async () => {
  const launcher = await readFile(launcherPath, "utf8");
  assert.match(launcher, /process\.env\.NEGRONI_APP_PORT \|\| "3000"/);
  assert.doesNotMatch(launcher, /process\.env\.PORT/);
});

test("local broker never returns command output in provider status", async () => {
  const stubs = await createCommandStubs();
  const port = await unusedPort();
  const token = "local-bridge-test-token";
  const credentialsPath = join(stubs, "credentials.json");
  const broker = spawn(process.execPath, [brokerPath], {
    env: {
      ...process.env,
      PATH: stubs,
      NEGRONI_BROKER_PORT: String(port),
      CREDENTIAL_BROKER_TOKEN: token,
      NEGRONI_CREDENTIALS_PATH: credentialsPath,
    },
  });
  try {
    const response = await waitForStatus(port, token);
    const body = await response.json() as { providers: Array<{ provider: string; status: string; detail: string | null }> };
    assert.equal(JSON.stringify(body).includes(canary), false);
    assert.deepEqual(body.providers.find((provider) => provider.provider === "gemini_oauth"), {
      provider: "gemini_oauth",
      status: "connected",
      blocker: null,
      detail: "Google Application Default Credentials are available.",
    });
  } finally {
    broker.kill("SIGTERM");
    await new Promise<void>((resolvePromise) => broker.once("exit", () => resolvePromise()));
    await rm(stubs, { recursive: true, force: true });
  }
});
