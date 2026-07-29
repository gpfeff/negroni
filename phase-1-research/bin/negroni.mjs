#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { fork, spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2] || "start";

if (command === "doctor") {
  const child = spawn(process.execPath, [resolve(packageRoot, "scripts/local-doctor.mjs")], {
    stdio: "inherit",
  });
  child.on("exit", (code) => process.exit(code ?? 1));
} else if (command === "start") {
  const brokerPort = process.env.NEGRONI_BROKER_PORT || "47831";
  const appPort = process.env.PORT || "3000";
  const token = randomBytes(32).toString("hex");
  const childEnvironment = {
    ...process.env,
    CREDENTIAL_BROKER_URL: `http://127.0.0.1:${brokerPort}`,
    CREDENTIAL_BROKER_TOKEN: token,
    NEGRONI_BROKER_PORT: brokerPort,
  };
  const broker = fork(resolve(packageRoot, "scripts/local-broker.mjs"), [], {
    env: childEnvironment,
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  broker.once("message", () => {
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    const app = spawn(npmCommand, ["run", "dev", "--", "--host", "127.0.0.1", "--port", appPort], {
      cwd: packageRoot,
      env: childEnvironment,
      stdio: "inherit",
    });
    const stop = () => {
      app.kill("SIGTERM");
      broker.kill("SIGTERM");
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    app.on("exit", (code) => {
      broker.kill("SIGTERM");
      process.exit(code ?? 0);
    });
    console.log(`\nNegroni is opening locally at http://127.0.0.1:${appPort}\n`);
  });
  broker.on("exit", (code) => {
    if (code) process.exit(code);
  });
} else {
  console.error("Usage: negroni [start|doctor]");
  process.exit(1);
}
