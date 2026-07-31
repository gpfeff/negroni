import { execFile } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PROVIDERS = ["codex_cli", "claude_code", "gemini_api", "gemini_oauth", "kie_ai", "apify", "google_drive"];
const credentialsPath = process.env.NEGRONI_CREDENTIALS_PATH
  || join(homedir(), ".negroni", "credentials.json");
const brokerToken = process.env.CREDENTIAL_BROKER_TOKEN;
const brokerPort = Number(process.env.NEGRONI_BROKER_PORT || "47831");
const geminiInteractionsBaseUrl = new URL(process.env.NEGRONI_GEMINI_INTERACTIONS_BASE_URL
  || "https://generativelanguage.googleapis.com/v1beta/interactions");
const GEMINI_DEEP_RESEARCH_AGENT = "deep-research-preview-04-2026";

if (!brokerToken) throw new Error("CREDENTIAL_BROKER_TOKEN is required.");

function tokenMatches(expected, header) {
  if (!header?.startsWith("Bearer ")) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(header.slice("Bearer ".length));
  return left.length === right.length && timingSafeEqual(left, right);
}

async function commandStatus(command, args, isConnected, connectedDetail) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: 8_000,
      windowsHide: true,
      env: process.env,
    });
    const output = `${stdout}\n${stderr}`.trim();
    return isConnected(output)
      ? { status: "connected", blocker: null, detail: connectedDetail }
      : { status: "not_connected", blocker: null, detail: "Login required" };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { status: "blocked", blocker: `${command} is not installed.`, detail: null };
    }
    return { status: "not_connected", blocker: null, detail: "Login required" };
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
    commandStatus("codex", ["login", "status"], (output) => /logged in/i.test(output), "Native Codex login is available."),
    commandStatus("claude", ["auth", "status"], (output) => /"loggedIn"\s*:\s*true/.test(output), "Native Claude Code login is available."),
    commandStatus("gcloud", ["auth", "application-default", "print-access-token"], (output) => output.length > 20, "Google Application Default Credentials are available."),
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
      provider: "apify",
      status: credentials.apify?.api_key ? "connected" : "not_connected",
      blocker: null,
      detail: credentials.apify?.api_key ? "API token stored locally" : null,
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

function allowedGeminiBaseUrl(url) {
  return (url.protocol === "https:" && url.hostname === "generativelanguage.googleapis.com")
    || (url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname));
}

async function proxyGeminiInteraction(path, init) {
  if (!allowedGeminiBaseUrl(geminiInteractionsBaseUrl)) {
    throw new Error("The Gemini Interactions API endpoint is not allowed.");
  }
  const credentials = await readCredentials();
  const apiKey = credentials.gemini_api?.api_key;
  if (typeof apiKey !== "string" || apiKey.length < 20) {
    return json({ error: "Gemini API is not connected." }, 409);
  }
  const target = new URL(path, geminiInteractionsBaseUrl.href.endsWith("/")
    ? geminiInteractionsBaseUrl
    : `${geminiInteractionsBaseUrl.href}/`);
  const response = await fetch(target, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
  });
  const body = await response.text();
  if (!response.ok) {
    return json({ error: "Gemini Interactions API request failed.", status: response.status }, 502);
  }
  return new Response(body, {
    status: response.status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function json(response, status = 200) {
  return new Response(JSON.stringify(response), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function handle(request) {
  if (!tokenMatches(brokerToken, request.headers.get("authorization"))) {
    return json({ error: "Unauthorized" }, 401);
  }
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/v1/providers/status") {
    return json({ available: true, providers: await providerStatuses(), blocker: null });
  }
  if (request.method === "POST" && url.pathname === "/v1/providers/connect") {
    const body = await request.json();
    if (!PROVIDERS.includes(body.provider)) return json({ error: "Unsupported provider" }, 400);
    if (body.provider === "gemini_api" || body.provider === "kie_ai" || body.provider === "apify") {
      if (typeof body.api_key !== "string" || body.api_key.trim().length < 20 || body.api_key.trim().length > 512) {
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
  if (request.method === "POST" && url.pathname === "/v1/providers/gemini/deep-research/interactions") {
    const body = await request.json();
    if (body.agent !== GEMINI_DEEP_RESEARCH_AGENT
      || typeof body.run_id !== "string"
      || !/^run_[a-f0-9]{24}$/.test(body.run_id)
      || typeof body.input !== "string"
      || !body.input.trim()
      || Buffer.byteLength(body.input, "utf8") > 512 * 1024) {
      return json({ error: "Invalid Gemini Deep Research request." }, 400);
    }
    return proxyGeminiInteraction("", {
      method: "POST",
      body: JSON.stringify({
        input: body.input,
        agent: GEMINI_DEEP_RESEARCH_AGENT,
        agent_config: {
          type: "deep-research",
          thinking_summaries: "none",
          visualization: "auto",
          collaborative_planning: false,
        },
        background: true,
        store: true,
        user_metadata: { negroni_run_id: body.run_id },
      }),
    });
  }
  const interactionMatch = url.pathname.match(/^\/v1\/providers\/gemini\/deep-research\/interactions\/(v1_[A-Za-z0-9_-]{10,512})$/);
  if (request.method === "GET" && interactionMatch) {
    return proxyGeminiInteraction(encodeURIComponent(interactionMatch[1]), { method: "GET" });
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
