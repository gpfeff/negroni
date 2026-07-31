import { authenticatedOwner } from "@/lib/authenticated-user";
import { boundedJson, mutationAllowed } from "@/lib/request-security";
import { getDatabase } from "@/lib/database";
import { credentialMetadata, EncryptedD1SecretStore, type ApiKeyProvider } from "@/lib/connections/encrypted-d1";
import type { ProviderStatus } from "@/lib/intelligence/contracts";
import {
  GOOGLE_DRIVE_FOLDER_NAME,
  GOOGLE_DRIVE_SCOPE,
  parseSettingsResponse,
  PROVIDERS,
  safeAuthorizationUrl,
} from "@/lib/provider-settings";

const SETTINGS_BLOCKER = "Secure provider setup is unavailable until the server-side credential broker is configured.";

function configuration() {
  return {
    url: process.env.CREDENTIAL_BROKER_URL?.trim() ?? "",
    token: process.env.CREDENTIAL_BROKER_TOKEN?.trim() ?? "",
  };
}

function brokerHeaders(token: string, owner: string): HeadersInit {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-negroni-owner": owner,
  };
}

async function internalStore() {
  const key = process.env.NEGRONI_SECRET_ENCRYPTION_KEY?.trim() ?? "";
  const database = await getDatabase();
  return database && key ? new EncryptedD1SecretStore(database, key) : null;
}

async function verifyApiKey(provider: ApiKeyProvider, key: string): Promise<boolean> {
  const endpoint = provider === "gemini"
    ? "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1"
    : provider === "kie_ai"
      ? "https://api.kie.ai/api/v1/chat/credit"
      : "https://api.apify.com/v2/users/me";
  const headers = new Headers(provider === "gemini" ? { "x-goog-api-key": key } : { authorization: `Bearer ${key}` });
  const response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(15_000) });
  return response.ok;
}

export async function GET(request: Request): Promise<Response> {
  const owner = authenticatedOwner(request);
  if (!owner) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const local = await internalStore();
  if (local) {
    const [gemini, kie, apify] = await Promise.all([
      local.metadata(owner, "gemini"), local.metadata(owner, "kie_ai"), local.metadata(owner, "apify"),
    ]);
    const keyed = (provider: "gemini_api" | "kie_ai" | "apify", metadata: typeof gemini) => ({
      provider, status: metadata ? "connected" as const : "not_connected" as const, blocker: null,
      detail: metadata ? `Verified · ending ${metadata.last_four}` : null,
    });
    const providers: ProviderStatus[] = [
      { provider: "codex_cli", status: "blocked", blocker: "Hosted agent CLI checks are unavailable." },
      { provider: "claude_code", status: "blocked", blocker: "Hosted agent CLI checks are unavailable." },
      keyed("gemini_api", gemini),
      { provider: "gemini_oauth", status: "blocked", blocker: "Gemini OAuth is not configured." },
      keyed("kie_ai", kie), keyed("apify", apify),
      { provider: "google_drive", status: "blocked", blocker: "Google Drive OAuth is not configured.", auto_store: false },
    ];
    return Response.json({ available: true, providers, blocker: null }, { headers: { "cache-control": "no-store" } });
  }
  const config = configuration();
  if (!config.url || !config.token) {
    const providers: ProviderStatus[] = [
      { provider: "codex_cli", status: "blocked", blocker: SETTINGS_BLOCKER },
      { provider: "claude_code", status: "blocked", blocker: SETTINGS_BLOCKER },
      { provider: "gemini_api", status: "blocked", blocker: SETTINGS_BLOCKER },
      { provider: "gemini_oauth", status: "blocked", blocker: SETTINGS_BLOCKER },
      { provider: "kie_ai", status: "blocked", blocker: SETTINGS_BLOCKER },
      { provider: "apify", status: "blocked", blocker: SETTINGS_BLOCKER },
      { provider: "google_drive", status: "blocked", blocker: SETTINGS_BLOCKER, auto_store: false },
    ];
    return Response.json({ available: false, providers, blocker: SETTINGS_BLOCKER }, { headers: { "cache-control": "no-store" } });
  }
  const response = await fetch(new URL("/v1/providers/status", config.url), {
    headers: brokerHeaders(config.token, owner),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return Response.json({ error: "Provider status could not be verified." }, { status: 502 });
  try {
    return Response.json(parseSettingsResponse(await response.json()), { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "Provider status could not be verified." }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const owner = authenticatedOwner(request);
  if (!owner) return Response.json({ error: "Authentication is required." }, { status: 401 });
  if (!mutationAllowed(request)) return Response.json({ error: "A same-origin request is required." }, { status: 403 });
  const body = await boundedJson(request) as { provider?: string; api_key?: string; confirmation?: string };
  const local = await internalStore();
  if (local && ["gemini_api", "kie_ai", "apify"].includes(body.provider ?? "")) {
    const provider = body.provider === "gemini_api" ? "gemini" : body.provider as ApiKeyProvider;
    const key = typeof body.api_key === "string" ? body.api_key.trim() : "";
    if (key.length < 20 || key.length > 512) return Response.json({ error: "Enter a valid API key." }, { status: 400 });
    const existing = await local.metadata(owner, provider);
    const expected = existing ? "replace" : "save";
    if (body.confirmation !== expected) return Response.json({ error: `Explicit ${expected} confirmation is required.` }, { status: 400 });
    let valid = false;
    try { valid = await verifyApiKey(provider, key); } catch { return Response.json({ error: "Provider verification could not be completed. The key was not saved." }, { status: 502 }); }
    if (!valid) return Response.json({ error: "The provider could not verify this API key. Check it and try again." }, { status: 400 });
    const metadata = credentialMetadata(key);
    const changed = existing
      ? await local.replace(owner, provider, key, metadata)
      : await local.create(owner, provider, key, metadata);
    if (!changed) return Response.json({ error: "The credential change could not be confirmed." }, { status: 409 });
    return Response.json({ connected: true, message: `${body.provider === "apify" ? "Apify" : body.provider === "kie_ai" ? "Kie.ai" : "Gemini"} connected. No paid task was started.` }, { headers: { "cache-control": "no-store" } });
  }
  const config = configuration();
  if (!config.url || !config.token) return Response.json({ error: SETTINGS_BLOCKER }, { status: 503 });
  if (!PROVIDERS.includes(body.provider as (typeof PROVIDERS)[number])) {
    return Response.json({ error: "The provider is not supported." }, { status: 400 });
  }
  if (body.provider === "gemini_api" && (typeof body.api_key !== "string" || body.api_key.trim().length < 20)) {
    return Response.json({ error: "Enter a valid Gemini API key." }, { status: 400 });
  }
  if (body.provider === "kie_ai" && (typeof body.api_key !== "string" || body.api_key.trim().length < 20)) {
    return Response.json({ error: "Enter a valid Kie.ai API key." }, { status: 400 });
  }
  if (body.provider === "apify" && (typeof body.api_key !== "string" || body.api_key.trim().length < 20 || body.api_key.trim().length > 512)) {
    return Response.json({ error: "Enter a valid Apify API token." }, { status: 400 });
  }
  const returnToUrl = new URL("/", request.url);
  returnToUrl.searchParams.set("view", "settings");
  returnToUrl.searchParams.set("provider", body.provider ?? "");
  const brokerBody = body.provider === "gemini_api" || body.provider === "kie_ai" || body.provider === "apify"
    ? { provider: body.provider, api_key: body.api_key }
    : body.provider === "google_drive"
      ? {
          provider: "google_drive",
          access_type: "offline",
          scopes: [GOOGLE_DRIVE_SCOPE],
          return_to: returnToUrl.toString(),
          storage: {
            auto_store: true,
            folder_name: GOOGLE_DRIVE_FOLDER_NAME,
            mode: "app_folder",
          },
        }
      : { provider: body.provider };
  const response = await fetch(new URL("/v1/providers/connect", config.url), {
    method: "POST",
    headers: brokerHeaders(config.token, owner),
    body: JSON.stringify(brokerBody),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json() as { authorization_url?: unknown; connected?: unknown; message?: unknown };
  if (!response.ok) return Response.json({ error: "The provider connection could not be completed." }, { status: 502 });
  if (body.provider === "gemini_api" || body.provider === "kie_ai" || body.provider === "apify"
    || typeof payload.connected === "boolean" || typeof payload.message === "string") {
    return Response.json(
      { connected: payload.connected === true, message: typeof payload.message === "string" ? payload.message : undefined },
      { headers: { "cache-control": "no-store" } },
    );
  }
  try {
    return Response.json(
      { authorization_url: safeAuthorizationUrl(payload.authorization_url) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "The provider connection could not be completed." }, { status: 502 });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const owner = authenticatedOwner(request);
  if (!owner) return Response.json({ error: "Authentication is required." }, { status: 401 });
  if (!mutationAllowed(request)) return Response.json({ error: "A same-origin request is required." }, { status: 403 });
  const body = await boundedJson(request) as { provider?: string; confirmation?: string };
  const provider = body.provider === "gemini_api" ? "gemini" : body.provider as ApiKeyProvider;
  if (!["gemini", "kie_ai", "apify"].includes(provider) || body.confirmation !== `disconnect ${body.provider}`) {
    return Response.json({ error: "Explicit disconnect confirmation is required." }, { status: 400 });
  }
  const local = await internalStore();
  if (!local) return Response.json({ error: SETTINGS_BLOCKER }, { status: 503 });
  await local.delete(owner, provider);
  return Response.json({ connected: false, message: "API credential disconnected." }, { headers: { "cache-control": "no-store" } });
}
