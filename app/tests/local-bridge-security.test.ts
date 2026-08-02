import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir, tmpdir } from "node:os";
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
const OWNER_A = "owner-a-opaque-key";
const OWNER_B = "owner-b-opaque-key";

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

async function waitForStatus(port: number, token: string, owner = OWNER_A) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/providers/status`, {
        headers: { authorization: `Bearer ${token}`, "x-negroni-owner": owner },
      });
      if (response.ok) return response;
    } catch {
      // The bridge may not have bound the loopback port yet.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  throw new Error("The local credential bridge did not become ready.");
}

async function waitForRunnerHealth(port: number, token: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: {
          authorization: `Bearer ${token}`,
          "x-negroni-owner": "private-service-test",
        },
      });
      if (response.ok) return response;
    } catch {
      // The private runner may not have bound the loopback port yet.
    }
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  throw new Error("The private runner did not become ready.");
}

async function waitForBrokerBoundary(port: number, token: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/secrets/gemini`, {
        headers: {
          authorization: `Bearer ${token}`,
          "x-negroni-owner": "private-service-test",
        },
      });
      if (response.ok) return response;
    } catch {
      // The private broker may not have bound the loopback port yet.
    }
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  throw new Error("The private credential broker did not become ready.");
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

test("private service hosting fails closed without stable server tokens", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [launcherPath, "serve-private"], {
      env: {
        ...process.env,
        CREDENTIAL_BROKER_TOKEN: "",
        NEGRONI_RUNNER_TOKEN: "",
      },
      timeout: 5_000,
    }),
    (error: NodeJS.ErrnoException & { stderr?: string }) => {
      assert.match(error.stderr ?? "", /CREDENTIAL_BROKER_TOKEN/);
      assert.doesNotMatch(error.stderr ?? "", /Bearer /);
      return true;
    },
  );
});

test("private service preflight validates ports and separate secrets without exposing them", async () => {
  const brokerPort = await unusedPort();
  let runnerPort = await unusedPort();
  while (runnerPort === brokerPort) runnerPort = await unusedPort();
  const brokerToken = "private-broker-preflight-token-0123456789abcdef";
  const runnerToken = "private-runner-preflight-token-0123456789abcdef";
  const environment = {
    ...process.env,
    CREDENTIAL_BROKER_TOKEN: brokerToken,
    NEGRONI_RUNNER_TOKEN: runnerToken,
    NEGRONI_BROKER_PORT: String(brokerPort),
    NEGRONI_RUNNER_PORT: String(runnerPort),
  };
  const { stdout, stderr } = await execFileAsync(process.execPath, [launcherPath, "check-private"], { env: environment });
  assert.match(stdout, /Private service configuration is valid/);
  assert.equal(`${stdout}${stderr}`.includes(brokerToken), false);
  assert.equal(`${stdout}${stderr}`.includes(runnerToken), false);

  await assert.rejects(
    execFileAsync(process.execPath, [launcherPath, "check-private"], {
      env: { ...environment, NEGRONI_RUNNER_TOKEN: brokerToken },
    }),
    (error: NodeJS.ErrnoException & { stderr?: string }) => {
      assert.match(error.stderr ?? "", /different server secrets/);
      assert.equal((error.stderr ?? "").includes(brokerToken), false);
      return true;
    },
  );
});

test("private service hosting starts only the authenticated loopback broker and runner", async () => {
  const runtimeParent = join(homedir(), ".local", "share", "negroni");
  const artifactParent = join(homedir(), "Documents", "tools-negroni");
  await Promise.all([mkdir(runtimeParent, { recursive: true }), mkdir(artifactParent, { recursive: true })]);
  const runtimeRoot = await mkdtemp(join(runtimeParent, "test-private-services-"));
  const artifactRoot = await mkdtemp(join(artifactParent, "test-private-services-"));
  const brokerPort = await unusedPort();
  let runnerPort = await unusedPort();
  while (runnerPort === brokerPort) runnerPort = await unusedPort();
  const brokerToken = "private-broker-test-token-0123456789abcdef";
  const runnerToken = "private-runner-test-token-0123456789abcdef";
  const output: string[] = [];
  const service = spawn(process.execPath, [launcherPath, "serve-private"], {
    env: {
      ...process.env,
      CREDENTIAL_BROKER_TOKEN: brokerToken,
      NEGRONI_RUNNER_TOKEN: runnerToken,
      NEGRONI_BROKER_PORT: String(brokerPort),
      NEGRONI_RUNNER_PORT: String(runnerPort),
      NEGRONI_RUNTIME_ROOT: runtimeRoot,
      NEGRONI_ARTIFACT_ROOT: artifactRoot,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  service.stdout?.on("data", (chunk) => output.push(String(chunk)));
  service.stderr?.on("data", (chunk) => output.push(String(chunk)));
  try {
    const [broker, runner] = await Promise.all([
      waitForBrokerBoundary(brokerPort, brokerToken),
      waitForRunnerHealth(runnerPort, runnerToken),
    ]);
    assert.equal(broker.status, 200);
    const capability = await runner.json() as { capabilities?: Record<string, string> };
    assert.equal(capability.capabilities?.prompt_source, "configured");
    assert.equal(capability.capabilities?.research_engine, "configured");
    assert.equal(capability.capabilities?.google_drive, "configured");

    const wrongBrokerToken = await fetch(`http://127.0.0.1:${brokerPort}/v1/secrets/gemini`, {
      headers: { authorization: "Bearer wrong-token", "x-negroni-owner": "private-service-test" },
    });
    const wrongRunnerToken = await fetch(`http://127.0.0.1:${runnerPort}/health`, {
      headers: { authorization: "Bearer wrong-token", "x-negroni-owner": "private-service-test" },
    });
    assert.equal(wrongBrokerToken.status, 401);
    assert.equal(wrongRunnerToken.status, 401);
    assert.equal(output.join("").includes(brokerToken), false);
    assert.equal(output.join("").includes(runnerToken), false);
  } finally {
    const exited = service.exitCode === null
      ? new Promise<void>((resolvePromise) => service.once("exit", () => resolvePromise()))
      : Promise.resolve();
    service.kill("SIGTERM");
    await Promise.race([
      exited,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Private services did not stop.")), 5_000)),
    ]);
    await Promise.all([
      rm(runtimeRoot, { recursive: true, force: true }),
      rm(artifactRoot, { recursive: true, force: true }),
    ]);
  }
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
    const unconfirmed = await fetch(`http://127.0.0.1:${port}/v1/providers/connect`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-negroni-owner": OWNER_A },
      body: JSON.stringify({ provider: "apify", api_key: apiKey }),
    });
    assert.equal(unconfirmed.status, 400);

    const save = await fetch(`http://127.0.0.1:${port}/v1/providers/connect`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-negroni-owner": OWNER_A },
      body: JSON.stringify({ provider: "apify", api_key: apiKey, confirmation: "save" }),
    });
    assert.equal(save.status, 200);
    assert.equal((await save.text()).includes(apiKey), false);
    const status = await waitForStatus(port, token, OWNER_A);
    const body = await status.text();
    assert.equal(body.includes(apiKey), false);
    assert.match(body, /"provider":"apify","status":"connected"/);

    const otherOwnerStatus = await waitForStatus(port, token, OWNER_B);
    assert.match(await otherOwnerStatus.text(), /"provider":"apify","status":"not_connected"/);

    const disconnected = await fetch(`http://127.0.0.1:${port}/v1/providers/connect`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-negroni-owner": OWNER_A },
      body: JSON.stringify({ provider: "apify" }),
    });
    assert.equal(disconnected.status, 200, await disconnected.clone().text());
    assert.equal((await disconnected.json() as { connected?: boolean }).connected, false);
    const disconnectedStatus = await waitForStatus(port, token, OWNER_A);
    assert.match(await disconnectedStatus.text(), /"provider":"apify","status":"not_connected"/);
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
  const receivedMethods: string[] = [];
  const google = createServer((request, response) => {
    receivedMethods.push(request.method ?? "");
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
      NEGRONI_GEMINI_API_KEY: "",
      NEGRONI_GEMINI_INTERACTIONS_BASE_URL: `http://127.0.0.1:${googleAddress.port}/v1beta/interactions`,
    },
  });
  try {
    await waitForStatus(brokerPort, token, OWNER_A);
    const save = await fetch(`http://127.0.0.1:${brokerPort}/v1/secrets/gemini`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-negroni-owner": OWNER_A },
      body: JSON.stringify({ api_key: apiKey }),
    });
    assert.equal(save.status, 200, await save.clone().text());
    assert.equal((await save.text()).includes(apiKey), false);

    const otherOwnerMetadata = await fetch(`http://127.0.0.1:${brokerPort}/v1/secrets/gemini`, {
      headers: { authorization: `Bearer ${token}`, "x-negroni-owner": OWNER_B },
    });
    assert.equal(otherOwnerMetadata.status, 200);
    assert.equal((await otherOwnerMetadata.json() as { metadata: unknown }).metadata, null);

    const otherOwnerResearch = await fetch(`http://127.0.0.1:${brokerPort}/v1/providers/gemini/deep-research/interactions`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-negroni-owner": OWNER_B },
      body: JSON.stringify({
        run_id: "run_0123456789abcdef01234567",
        agent: "deep-research-preview-04-2026",
        input: "This owner must not inherit another owner's credential.",
      }),
    });
    assert.equal(otherOwnerResearch.status, 409);

    const response = await fetch(`http://127.0.0.1:${brokerPort}/v1/providers/gemini/deep-research/interactions`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-negroni-owner": OWNER_A },
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
    assert.equal(upstream.store, true);
    assert.equal("user_metadata" in upstream, false);
    assert.equal((await response.text()).includes(apiKey), false);

    const retryResponse = await fetch(`http://127.0.0.1:${brokerPort}/v1/providers/gemini/deep-research/interactions`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-negroni-owner": OWNER_A },
      body: JSON.stringify({
        run_id: "run_0123456789abcdef01234567",
        agent: "deep-research-preview-04-2026",
        input: "Retry the same approved run without creating a second interaction.",
      }),
    });
    assert.equal(retryResponse.status, 200);
    assert.deepEqual(receivedMethods, ["POST", "GET"]);

    const maxResponse = await fetch(`http://127.0.0.1:${brokerPort}/v1/providers/gemini/deep-research/interactions`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-negroni-owner": OWNER_A },
      body: JSON.stringify({
        run_id: "run_0123456789abcdef01234567",
        agent: "deep-research-max-preview-04-2026",
        input: "This tier must be rejected after the standard-tier switch.",
      }),
    });
    assert.equal(maxResponse.status, 400);
    assert.equal((await maxResponse.text()).includes(apiKey), false);

    const metadataResponse = await fetch(`http://127.0.0.1:${brokerPort}/v1/secrets/gemini`, {
      headers: { authorization: `Bearer ${token}`, "x-negroni-owner": OWNER_A },
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
