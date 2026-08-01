import { authenticatedOwner } from "@/lib/authenticated-user";
import { boundedJson, mutationAllowed } from "@/lib/request-security";
import type { ProviderStatus } from "@/lib/intelligence/contracts";
import { opaqueOwnerKey } from "@/lib/owner-key";
import { safeServiceEndpoint } from "@/lib/safe-service-url";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function settingsBody(request: Request): Promise<{ provider?: string; api_key?: string; confirmation?: string } | null> {
  try {
    const value = await boundedJson(request, 4_096);
    if (!isRecord(value)) return null;
    return {
      provider: typeof value.provider === "string" ? value.provider : undefined,
      api_key: typeof value.api_key === "string" ? value.api_key : undefined,
      confirmation: typeof value.confirmation === "string" ? value.confirmation : undefined,
    };
  } catch {
    return null;
  }
}

function brokerHeaders(token: string, owner: string): HeadersInit {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-negroni-owner": opaqueOwnerKey(owner),
  };
}

export async function GET(request: Request): Promise<Response> {
  const owner = authenticatedOwner(request);
  if (!owner) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const config = configuration();
  if (config.url && config.token) {
    const endpoint = safeServiceEndpoint(config.url, "/v1/providers/status");
    if (!endpoint) return Response.json({ error: SETTINGS_BLOCKER }, { status: 503 });
    try {
      const response = await fetch(endpoint, {
        headers: brokerHeaders(config.token, owner),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return Response.json({ error: "Provider status could not be verified." }, { status: 502 });
      return Response.json(parseSettingsResponse(await response.json()), { headers: { "cache-control": "no-store" } });
    } catch {
      return Response.json({ error: "Provider status could not be verified." }, { status: 502 });
    }
  }
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

export async function POST(request: Request): Promise<Response> {
  const owner = authenticatedOwner(request);
  if (!owner) return Response.json({ error: "Authentication is required." }, { status: 401 });
  if (!mutationAllowed(request)) return Response.json({ error: "A same-origin request is required." }, { status: 403 });
  const body = await settingsBody(request);
  if (!body) return Response.json({ error: "The provider connection request is invalid." }, { status: 400 });
  const config = configuration();
  if (!config.url || !config.token) return Response.json({ error: SETTINGS_BLOCKER }, { status: 503 });
  const connectEndpoint = safeServiceEndpoint(config.url, "/v1/providers/connect");
  if (!connectEndpoint) return Response.json({ error: SETTINGS_BLOCKER }, { status: 503 });
  if (!PROVIDERS.includes(body.provider as (typeof PROVIDERS)[number])) {
    return Response.json({ error: "The provider is not supported." }, { status: 400 });
  }
  if (["gemini_api", "kie_ai", "apify"].includes(body.provider ?? "")
    && body.confirmation !== "save" && body.confirmation !== "replace") {
    return Response.json({ error: "Explicit save or replace confirmation is required." }, { status: 400 });
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
  returnToUrl.searchParams.set("view", "integrations");
  returnToUrl.searchParams.set("provider", body.provider ?? "");
  const brokerBody = body.provider === "gemini_api" || body.provider === "kie_ai" || body.provider === "apify"
    ? { provider: body.provider, api_key: body.api_key, confirmation: body.confirmation }
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
  let response: Response;
  let payload: { authorization_url?: unknown; connected?: unknown; message?: unknown };
  try {
    response = await fetch(connectEndpoint, {
      method: "POST",
      headers: brokerHeaders(config.token, owner),
      body: JSON.stringify(brokerBody),
      signal: AbortSignal.timeout(15_000),
    });
    payload = await response.json() as typeof payload;
  } catch {
    return Response.json({ error: "The provider connection could not be completed." }, { status: 502 });
  }
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
  const body = await settingsBody(request);
  if (!body) return Response.json({ error: "The provider disconnect request is invalid." }, { status: 400 });
  if (!["gemini_api", "kie_ai", "apify"].includes(body.provider ?? "") || body.confirmation !== `disconnect ${body.provider}`) {
    return Response.json({ error: "Explicit disconnect confirmation is required." }, { status: 400 });
  }
  const config = configuration();
  if (config.url && config.token) {
    const endpoint = safeServiceEndpoint(config.url, "/v1/providers/connect");
    if (!endpoint) return Response.json({ error: SETTINGS_BLOCKER }, { status: 503 });
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "DELETE",
        headers: brokerHeaders(config.token, owner),
        body: JSON.stringify({ provider: body.provider }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      return Response.json({ error: "The API credential could not be disconnected." }, { status: 502 });
    }
    if (response.status === 409) {
      return Response.json({ error: "This credential is managed by the private service environment and cannot be disconnected here." }, { status: 409 });
    }
    if (!response.ok) return Response.json({ error: "The API credential could not be disconnected." }, { status: 502 });
    let payload: { connected?: unknown; message?: unknown };
    try { payload = await response.json() as typeof payload; }
    catch { return Response.json({ error: "The API credential could not be disconnected." }, { status: 502 }); }
    return Response.json({
      connected: payload.connected === false ? false : undefined,
      message: typeof payload.message === "string" ? payload.message : "API credential disconnected.",
    }, { headers: { "cache-control": "no-store" } });
  }
  return Response.json({ error: SETTINGS_BLOCKER }, { status: 503 });
}
