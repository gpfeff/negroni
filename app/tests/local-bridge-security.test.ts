import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
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
const packagePath = join(appRoot, "package.json");
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

test("repository local development uses the same loopback launcher", async () => {
  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as { scripts: Record<string, string> };
  assert.equal(packageJson.scripts["dev:local"], "node bin/negroni.mjs start");
});

test("local launcher starts the secure runner with embedded prompts and Drive filing", async () => {
  const launcher = await readFile(launcherPath, "utf8");
  assert.match(launcher, /bin\/research-runner\.ts/);
  assert.match(launcher, /LEAD_INTELLIGENCE_RUNNER_URL/);
  assert.match(launcher, /NEGRONI_PROMPT_SOURCE_MODE:\s*"embedded"/);
  assert.match(launcher, /NEGRONI_GOOGLE_DRIVE_ENABLED:\s*"1"/);
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

test("local broker keeps an entered Apify token in process memory without plaintext persistence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "negroni-apify-broker-"));
  const port = await unusedPort();
  const token = "local-bridge-test-token";
  const apiKey = "apify_api_test_token_never_returned";
  const credentialsPath = join(directory, "credentials.json");
  const broker = spawn(process.execPath, [brokerPath], {
    env: { ...process.env, NEGRONI_BROKER_PORT: String(port), CREDENTIAL_BROKER_TOKEN: token, NEGRONI_CREDENTIALS_PATH: credentialsPath },
  });
  try {
    await waitForStatus(port, token);
    const save = await fetch(`http://127.0.0.1:${port}/v1/providers/connect`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ provider: "apify", api_key: apiKey }),
    });
    assert.equal(save.status, 200);
    assert.equal((await save.text()).includes(apiKey), false);
    const status = await waitForStatus(port, token);
    const body = await status.text();
    assert.equal(body.includes(apiKey), false);
    assert.match(body, /"provider":"apify","status":"connected"/);
    await assert.rejects(stat(credentialsPath), (error: NodeJS.ErrnoException) => error.code === "ENOENT");
  } finally {
    broker.kill("SIGTERM");
    await new Promise<void>((resolvePromise) => broker.once("exit", () => resolvePromise()));
    await rm(directory, { recursive: true, force: true });
  }
});

test("local broker keeps the Gemini key server-side and fixes the standard Deep Research agent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "negroni-gemini-broker-"));
  const brokerPort = await unusedPort();
  const token = "local-bridge-test-token";
  const apiKey = "test-gemini-key-never-returned";
  const credentialsPath = join(directory, "credentials.json");

  let receivedHeader = "";
  let receivedBody = "";
  const google = createServer((request, response) => {
    receivedHeader = String(request.headers["x-goog-api-key"] ?? "");
    request.setEncoding("utf8");
    request.on("data", (chunk) => { receivedBody += chunk; });
    request.on("end", () => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: "v1_0123456789abcdef", status: "in_progress" }));
    });
  });
  await new Promise<void>((resolvePromise) => google.listen(0, "127.0.0.1", resolvePromise));
  const googleAddress = google.address();
  assert.ok(googleAddress && typeof googleAddress === "object");

  const broker = spawn(process.execPath, [brokerPath], {
    env: {
      ...process.env,
      NEGRONI_BROKER_PORT: String(brokerPort),
      CREDENTIAL_BROKER_TOKEN: token,
      NEGRONI_CREDENTIALS_PATH: credentialsPath,
      NEGRONI_GEMINI_API_KEY: apiKey,
      NEGRONI_GEMINI_INTERACTIONS_BASE_URL: `http://127.0.0.1:${googleAddress.port}/v1beta/interactions`,
    },
  });
  try {
    await waitForStatus(brokerPort, token);
    const response = await fetch(`http://127.0.0.1:${brokerPort}/v1/providers/gemini/deep-research/interactions`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        run_id: "run_0123456789abcdef01234567",
        agent: "deep-research-preview-04-2026",
        input: "Bounded foundational research request.",
      }),
    });
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(receivedHeader, apiKey);
    const upstream = JSON.parse(receivedBody);
    assert.equal(upstream.agent, "deep-research-preview-04-2026");
    assert.equal(upstream.agent_config.collaborative_planning, false);
    assert.equal(upstream.background, true);
    assert.equal((await response.text()).includes(apiKey), false);

    const maxResponse = await fetch(`http://127.0.0.1:${brokerPort}/v1/providers/gemini/deep-research/interactions`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        run_id: "run_0123456789abcdef01234567",
        agent: "deep-research-max-preview-04-2026",
        input: "This tier must be rejected after the standard-tier switch.",
      }),
    });
    assert.equal(maxResponse.status, 400);
    assert.equal((await maxResponse.text()).includes(apiKey), false);

    const metadataResponse = await fetch(`http://127.0.0.1:${brokerPort}/v1/secrets/gemini`, {
      headers: { authorization: `Bearer ${token}`, "x-negroni-owner": "local-preview" },
    });
    assert.equal(metadataResponse.status, 200);
    const metadataBody = await metadataResponse.text();
    assert.equal(metadataBody.includes(apiKey), false);
    const metadata = JSON.parse(metadataBody).metadata;
    assert.equal(metadata.last_four, apiKey.slice(-4));
    assert.match(metadata.fingerprint, /^[a-f0-9]{12}$/);
  } finally {
    broker.kill("SIGTERM");
    await new Promise<void>((resolvePromise) => broker.once("exit", () => resolvePromise()));
    await new Promise<void>((resolvePromise, reject) => google.close((error) => error ? reject(error) : resolvePromise()));
    await rm(directory, { recursive: true, force: true });
  }
});
