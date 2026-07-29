import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PROVIDERS = ["codex_cli", "claude_code", "gemini_api", "gemini_oauth", "kie_ai", "google_drive"];
const credentialsPath = process.env.NEGRONI_CREDENTIALS_PATH
  || join(homedir(), ".negroni", "credentials.json");
const brokerToken = process.env.CREDENTIAL_BROKER_TOKEN;
const brokerPort = Number(process.env.NEGRONI_BROKER_PORT || "47831");

if (!brokerToken) throw new Error("CREDENTIAL_BROKER_TOKEN is required.");

async function commandStatus(command, args, isConnected) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: 8_000,
      windowsHide: true,
      env: process.env,
    });
    const output = `${stdout}\n${stderr}`.trim();
    return isConnected(output)
      ? { status: "connected", blocker: null, detail: output.slice(0, 300) || "Authenticated" }
      : { status: "not_connected", blocker: null, detail: output.slice(0, 300) || "Login required" };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { status: "blocked", blocker: `${command} is not installed.`, detail: null };
    }
    const output = `${error?.stdout || ""}\n${error?.stderr || ""}`.trim();
    return { status: "not_connected", blocker: null, detail: output.slice(0, 300) || "Login required" };
  }
}

async function readCredentials() {
  try {
    const value = JSON.parse(await readFile(credentialsPath, "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

async function storeCredential(provider, apiKey) {
  const credentials = await readCredentials();
  credentials[provider] = { api_key: apiKey, updated_at: new Date().toISOString() };
  await mkdir(dirname(credentialsPath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${credentialsPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, credentialsPath);
}

async function providerStatuses() {
  const credentials = await readCredentials();
  const [codex, claude, geminiOAuth] = await Promise.all([
    commandStatus("codex", ["login", "status"], (output) => /logged in/i.test(output)),
    commandStatus("claude", ["auth", "status"], (output) => /"loggedIn"\s*:\s*true/.test(output)),
    commandStatus("gcloud", ["auth", "application-default", "print-access-token"], (output) => output.length > 20),
  ]);
  if (claude.status !== "connected" && claude.status !== "blocked") {
    claude.detail = "Claude Code is installed. Login required.";
  }
  return [
    { provider: "codex_cli", ...codex },
    { provider: "claude_code", ...claude },
    {
      provider: "gemini_api",
      status: credentials.gemini_api?.api_key ? "connected" : "not_connected",
      blocker: null,
      detail: credentials.gemini_api?.api_key ? "API key stored locally" : null,
    },
    { provider: "gemini_oauth", ...geminiOAuth },
    {
      provider: "kie_ai",
      status: credentials.kie_ai?.api_key ? "connected" : "not_connected",
      blocker: null,
      detail: credentials.kie_ai?.api_key ? "API key stored locally" : null,
    },
    {
      provider: "google_drive",
      status: "blocked",
      blocker: "Google Drive OAuth needs a Google client ID in the local bridge.",
      detail: null,
      auto_store: false,
    },
  ];
}

function json(response, status = 200) {
  return new Response(JSON.stringify(response), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function handle(request) {
  if (request.headers.get("authorization") !== `Bearer ${brokerToken}`) {
    return json({ error: "Unauthorized" }, 401);
  }
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/v1/providers/status") {
    return json({ available: true, providers: await providerStatuses(), blocker: null });
  }
  if (request.method === "POST" && url.pathname === "/v1/providers/connect") {
    const body = await request.json();
    if (!PROVIDERS.includes(body.provider)) return json({ error: "Unsupported provider" }, 400);
    if (body.provider === "gemini_api" || body.provider === "kie_ai") {
      if (typeof body.api_key !== "string" || body.api_key.trim().length < 20) {
        return json({ error: "A valid API key is required." }, 400);
      }
      await storeCredential(body.provider, body.api_key.trim());
      return json({ connected: true, message: "API key stored in the local Negroni vault." });
    }
    const statuses = await providerStatuses();
    const provider = statuses.find((item) => item.provider === body.provider);
    if (provider?.status === "connected") return json({ connected: true, message: "Connection verified." });
    const loginCommands = {
      codex_cli: "Run `codex login` in Terminal, then check the connection again.",
      claude_code: "Run `claude auth login` in Terminal, then check the connection again.",
      gemini_oauth: "Run `gcloud auth application-default login`, then check the connection again.",
      google_drive: "Add a Google OAuth client ID to the local bridge before connecting Drive.",
    };
    return json({ connected: false, message: loginCommands[body.provider] || provider?.blocker || "Connection is not ready." });
  }
  return json({ error: "Not found" }, 404);
}

const server = createServer(async (request, response) => {
  try {
    const origin = `http://${request.headers.host || `127.0.0.1:${brokerPort}`}`;
    const webResponse = await handle(new Request(new URL(request.url || "/", origin), {
      method: request.method,
      headers: request.headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request,
      duplex: "half",
    }));
    response.writeHead(webResponse.status, Object.fromEntries(webResponse.headers));
    response.end(Buffer.from(await webResponse.arrayBuffer()));
  } catch {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Local credential broker failed." }));
  }
});

server.listen(brokerPort, "127.0.0.1", () => {
  process.send?.({ type: "ready", port: brokerPort });
});
