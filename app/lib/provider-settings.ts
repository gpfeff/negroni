import type { ProviderStatus, SettingsResponse } from "@/lib/intelligence/contracts";

export const PROVIDERS = [
  "codex_cli",
  "claude_code",
  "gemini_api",
  "gemini_oauth",
  "kie_ai",
  "google_drive",
] as const;
export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const GOOGLE_DRIVE_FOLDER_NAME = "Negroni Research";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown, maximumLength: number): string | null {
  return typeof value === "string" && value.trim() && value.length <= maximumLength ? value.trim() : null;
}

function parseProviderStatus(value: unknown): ProviderStatus {
  if (!isRecord(value) || !PROVIDERS.includes(value.provider as (typeof PROVIDERS)[number])) {
    throw new Error("The credential broker returned an unsupported provider.");
  }
  if (!["connected", "not_connected", "blocked"].includes(value.status as string)) {
    throw new Error("The credential broker returned an invalid provider status.");
  }
  const status = value.status as ProviderStatus["status"];
  const blocker = optionalText(value.blocker, 500);
  const detail = optionalText(value.detail, 500);
  if (status === "blocked" && !blocker) {
    throw new Error("The credential broker omitted a provider blocker.");
  }

  const provider = value.provider as ProviderStatus["provider"];
  if (provider !== "google_drive") return { provider, status, blocker, detail };

  const accountEmail = optionalText(value.account_email, 320);
  const folderId = optionalText(value.folder_id, 256);
  const folderName = optionalText(value.folder_name, 256);
  const autoStore = status === "connected" && value.auto_store === true;
  if (status === "connected" && (!accountEmail || !folderId || !folderName || !autoStore)) {
    throw new Error("The credential broker returned an incomplete Google Workspace connection.");
  }
  return {
    provider,
    status,
    blocker,
    account_email: accountEmail,
    folder_id: folderId,
    folder_name: folderName,
    auto_store: autoStore,
  };
}

export function parseSettingsResponse(value: unknown): SettingsResponse {
  if (!isRecord(value) || typeof value.available !== "boolean" || !Array.isArray(value.providers)) {
    throw new Error("The credential broker returned an invalid settings response.");
  }
  const providers = value.providers.map(parseProviderStatus);
  const providerNames = providers.map(({ provider }) => provider);
  if (new Set(providerNames).size !== providers.length
    || providers.length !== PROVIDERS.length
    || PROVIDERS.some((provider) => !providerNames.includes(provider))) {
    throw new Error("The credential broker did not return the complete provider state.");
  }
  const blocker = optionalText(value.blocker, 500);
  if (!value.available && !blocker) throw new Error("The credential broker omitted its settings blocker.");
  return {
    available: value.available,
    providers,
    blocker,
  };
}

export function safeAuthorizationUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error("The credential broker did not return an OAuth authorization URL.");
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("The credential broker returned an unsafe OAuth authorization URL.");
  return url.toString();
}
