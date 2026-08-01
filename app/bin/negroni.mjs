#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { fork, spawn } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2] || "start";

function requiredServerToken(name) {
  const value = process.env[name] ?? "";
  if (value.length < 32 || value.length > 512 || /\s/.test(value)) {
    throw new Error(`${name} must be supplied as a 32-512 character server secret.`);
  }
  return value;
}

function privateServicePort(name, fallback) {
  const raw = process.env[name] || fallback;
  if (!/^\d{4,5}$/.test(raw)) throw new Error(`${name} must be an unprivileged TCP port.`);
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`${name} must be an unprivileged TCP port.`);
  }
  return String(port);
}

function privateServiceConfiguration() {
  const brokerPort = privateServicePort("NEGRONI_BROKER_PORT", "47831");
  const runnerPort = privateServicePort("NEGRONI_RUNNER_PORT", "47832");
  if (brokerPort === runnerPort) throw new Error("The broker and runner must use different loopback ports.");
  const brokerToken = requiredServerToken("CREDENTIAL_BROKER_TOKEN");
  const runnerToken = requiredServerToken("NEGRONI_RUNNER_TOKEN");
  if (brokerToken === runnerToken) throw new Error("The broker and runner must use different server secrets.");
  return { brokerPort, runnerPort, brokerToken, runnerToken };
}

async function assertLoopbackPortAvailable(name, port) {
  const server = createServer();
  try {
    await new Promise((resolvePromise, reject) => {
      server.once("error", reject);
      server.listen(Number(port), "127.0.0.1", resolvePromise);
    });
  } catch {
    throw new Error(`${name} is already in use on loopback.`);
  } finally {
    if (server.listening) {
      await new Promise((resolvePromise) => server.close(resolvePromise));
    }
  }
}

if (command === "research" && process.argv[3] === "competitors" && process.argv[4] === "run") {
  const child = spawn(process.execPath, [
    "--experimental-strip-types",
    resolve(packageRoot, "bin/competitor-research.ts"),
    ...process.argv.slice(5),
  ], {
    stdio: "inherit",
  });
  process.once("SIGINT", () => child.kill("SIGINT"));
  process.once("SIGTERM", () => child.kill("SIGTERM"));
  child.on("exit", (code) => process.exit(code ?? 5));
} else if (command === "draper") {
  const child = spawn(process.execPath, [
    "--experimental-strip-types",
    resolve(packageRoot, "bin/draper.ts"),
    ...process.argv.slice(3),
  ], {
    stdio: "inherit",
  });
  process.once("SIGINT", () => child.kill("SIGINT"));
  process.once("SIGTERM", () => child.kill("SIGTERM"));
  child.on("exit", (code) => process.exit(code ?? 5));
} else if (command === "doctor") {
  const child = spawn(process.execPath, [resolve(packageRoot, "scripts/local-doctor.mjs")], {
    stdio: "inherit",
  });
  child.on("exit", (code) => process.exit(code ?? 1));
} else if (command === "check-private") {
  try {
    const configuration = privateServiceConfiguration();
    await Promise.all([
      assertLoopbackPortAvailable("NEGRONI_BROKER_PORT", configuration.brokerPort),
      assertLoopbackPortAvailable("NEGRONI_RUNNER_PORT", configuration.runnerPort),
    ]);
    console.log(`Private service configuration is valid for loopback ports ${configuration.brokerPort} and ${configuration.runnerPort}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Private service configuration is invalid.");
    process.exit(1);
  }
} else if (command === "serve-private") {
  let brokerPort;
  let runnerPort;
  let brokerToken;
  let runnerToken;
  try {
    ({ brokerPort, runnerPort, brokerToken, runnerToken } = privateServiceConfiguration());
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Private service configuration is invalid.");
    process.exit(1);
  }
  const childEnvironment = {
    ...process.env,
    CREDENTIAL_BROKER_URL: `http://127.0.0.1:${brokerPort}`,
    CREDENTIAL_BROKER_TOKEN: brokerToken,
    NEGRONI_BROKER_PORT: brokerPort,
    NEGRONI_RUNNER_PORT: runnerPort,
    NEGRONI_RUNNER_TOKEN: runnerToken,
    NEGRONI_PROMPT_SOURCE_MODE: "embedded",
    NEGRONI_GOOGLE_DRIVE_ENABLED: "1",
  };
  const broker = fork(resolve(packageRoot, "scripts/local-broker.mjs"), [], {
    env: childEnvironment,
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  let runner;
  let stopping = false;
  const stop = (code = 0) => {
    if (stopping) return;
    stopping = true;
    runner?.kill("SIGTERM");
    broker.kill("SIGTERM");
    setTimeout(() => process.exit(code), 250).unref();
  };
  const waitForRunner = async () => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${runnerPort}/health`, {
          headers: {
            authorization: `Bearer ${runnerToken}`,
            "x-negroni-owner": "private-service-healthcheck",
          },
          signal: AbortSignal.timeout(500),
        });
        if (response.ok) return;
      } catch {
        // The loopback runner may still be binding its port.
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
    }
    throw new Error("The secure research runner did not become ready.");
  };
  process.once("SIGINT", () => stop(0));
  process.once("SIGTERM", () => stop(0));
  broker.once("message", async () => {
    runner = spawn(process.execPath, [
      "--experimental-strip-types",
      resolve(packageRoot, "bin/research-runner.ts"),
    ], {
      cwd: packageRoot,
      env: childEnvironment,
      stdio: "inherit",
    });
    runner.on("exit", (code) => {
      if (!stopping) stop(code ?? 1);
    });
    try {
      await waitForRunner();
    } catch (error) {
      console.error(error instanceof Error ? error.message : "The secure research runner failed to start.");
      stop(1);
      return;
    }
    console.log(`Negroni private services are ready on loopback ports ${brokerPort} and ${runnerPort}.`);
  });
  broker.on("exit", (code) => {
    if (!stopping) stop(code ?? 1);
  });
} else if (command === "start") {
  const brokerPort = process.env.NEGRONI_BROKER_PORT || "47831";
  const runnerPort = process.env.NEGRONI_RUNNER_PORT || "47832";
  const appPort = process.env.NEGRONI_APP_PORT || "3000";
  const brokerToken = randomBytes(32).toString("hex");
  const runnerToken = randomBytes(32).toString("hex");
  const childEnvironment = {
    ...process.env,
    CREDENTIAL_BROKER_URL: `http://127.0.0.1:${brokerPort}`,
    CREDENTIAL_BROKER_TOKEN: brokerToken,
    NEGRONI_BROKER_PORT: brokerPort,
    NEGRONI_RUNNER_PORT: runnerPort,
    NEGRONI_RUNNER_TOKEN: runnerToken,
    LEAD_INTELLIGENCE_RUNNER_URL: `http://127.0.0.1:${runnerPort}/v1/research-runs`,
    LEAD_INTELLIGENCE_RUNNER_TOKEN: runnerToken,
    NEGRONI_PROMPT_SOURCE_MODE: "embedded",
    NEGRONI_GOOGLE_DRIVE_ENABLED: "1",
  };
  const broker = fork(resolve(packageRoot, "scripts/local-broker.mjs"), [], {
    env: childEnvironment,
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  let runner;
  let app;
  let stopping = false;
  const stop = (code = 0) => {
    if (stopping) return;
    stopping = true;
    app?.kill("SIGTERM");
    runner?.kill("SIGTERM");
    broker.kill("SIGTERM");
    setTimeout(() => process.exit(code), 250).unref();
  };
  const waitForRunner = async () => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${runnerPort}/health`, {
          headers: {
            authorization: `Bearer ${runnerToken}`,
            "x-negroni-owner": "local-launcher-healthcheck",
          },
          signal: AbortSignal.timeout(500),
        });
        if (response.ok) return;
      } catch {
        // The loopback runner may still be binding its port.
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
    }
    throw new Error("The secure research runner did not become ready.");
  };
  process.once("SIGINT", () => stop(0));
  process.once("SIGTERM", () => stop(0));
  broker.once("message", async () => {
    runner = spawn(process.execPath, [
      "--experimental-strip-types",
      resolve(packageRoot, "bin/research-runner.ts"),
    ], {
      cwd: packageRoot,
      env: childEnvironment,
      stdio: "inherit",
    });
    runner.on("exit", (code) => {
      if (!stopping) stop(code ?? 1);
    });
    try {
      await waitForRunner();
    } catch (error) {
      console.error(error instanceof Error ? error.message : "The secure research runner failed to start.");
      stop(1);
      return;
    }
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    app = spawn(npmCommand, ["run", "dev", "--", "--host", "127.0.0.1", "--port", appPort], {
      cwd: packageRoot,
      env: childEnvironment,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    app.on("exit", (code) => {
      if (!stopping) stop(code ?? 0);
    });
    console.log(`\nNegroni is opening locally at http://127.0.0.1:${appPort}\n`);
  });
  broker.on("exit", (code) => {
    if (!stopping) stop(code ?? 1);
  });
} else {
  console.error("Usage: negroni [start|check-private|serve-private|doctor|draper|research competitors run]");
  process.exit(1);
}
