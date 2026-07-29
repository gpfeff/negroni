import { authenticatedOwner } from "@/lib/authenticated-user";
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

export async function GET(request: Request): Promise<Response> {
  const owner = authenticatedOwner(request);
  if (!owner) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const config = configuration();
  if (!config.url || !config.token) {
    const providers: ProviderStatus[] = [
      { provider: "codex_cli", status: "blocked", blocker: SETTINGS_BLOCKER },
      { provider: "claude_code", status: "blocked", blocker: SETTINGS_BLOCKER },
      { provider: "gemini_api", status: "blocked", blocker: SETTINGS_BLOCKER },
      { provider: "gemini_oauth", status: "blocked", blocker: SETTINGS_BLOCKER },
      { provider: "kie_ai", status: "blocked", blocker: SETTINGS_BLOCKER },
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
  const config = configuration();
  if (!config.url || !config.token) return Response.json({ error: SETTINGS_BLOCKER }, { status: 503 });
  const body = await request.json() as { provider?: string; api_key?: string };
  if (!PROVIDERS.includes(body.provider as (typeof PROVIDERS)[number])) {
    return Response.json({ error: "The provider is not supported." }, { status: 400 });
  }
  if (body.provider === "gemini_api" && (typeof body.api_key !== "string" || body.api_key.trim().length < 20)) {
    return Response.json({ error: "Enter a valid Gemini API key." }, { status: 400 });
  }
  if (body.provider === "kie_ai" && (typeof body.api_key !== "string" || body.api_key.trim().length < 20)) {
    return Response.json({ error: "Enter a valid Kie.ai API key." }, { status: 400 });
  }
  const returnToUrl = new URL("/", request.url);
  returnToUrl.searchParams.set("view", "settings");
  returnToUrl.searchParams.set("provider", body.provider ?? "");
  const brokerBody = body.provider === "gemini_api" || body.provider === "kie_ai"
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
  if (body.provider === "gemini_api" || body.provider === "kie_ai"
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
