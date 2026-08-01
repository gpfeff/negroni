import { createGeminiConnectionService, InMemorySecretStore, type SecretStore } from "./gemini.ts";
import { opaqueOwnerKey } from "@/lib/owner-key";
import { safeServiceUrl } from "@/lib/safe-service-url";

export const GEMINI_BROKER_BLOCKER = "Secure hosted API-key storage is not configured.";

function brokerConfig() {
  return { url: process.env.CREDENTIAL_BROKER_URL?.trim() ?? "", token: process.env.CREDENTIAL_BROKER_TOKEN?.trim() ?? "" };
}

class HostedGeminiSecretStore implements SecretStore {
  constructor(private readonly url: string, private readonly token: string) {}
  async request(owner: string, method: string, body?: unknown) {
    const response = await fetch(new URL("/v1/secrets/gemini", this.url), {
      method,
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json", "x-negroni-owner": opaqueOwnerKey(owner) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 404 || (response.status === 409 && method !== "DELETE")) {
      return { changed: false, metadata: null, api_key: null };
    }
    if (!response.ok) throw new Error("Credential broker request failed.");
    return await response.json() as { changed?: boolean; metadata?: { last_verified_at: string; fingerprint: string; last_four: string } | null; api_key?: string | null };
  }
  async metadata(owner: string) { return (await this.request(owner, "GET")).metadata ?? null; }
  async create(owner: string, _name: "gemini", value: string, metadata: Parameters<SecretStore["create"]>[3]) { return (await this.request(owner, "POST", { api_key: value, metadata })).changed === true; }
  async replace(owner: string, _name: "gemini", value: string, metadata: Parameters<SecretStore["replace"]>[3]) { return (await this.request(owner, "PUT", { api_key: value, metadata })).changed === true; }
  async delete(owner: string) { return (await this.request(owner, "DELETE")).changed === true; }
  async read(owner: string) { return (await this.request(owner, "POST", { operation: "read" })).api_key ?? null; }
}

let localFakeStore: InMemorySecretStore | null = null;

export async function getGeminiSecretStore(): Promise<SecretStore | null> {
  const fakeEnabled = process.env.NEGRONI_LOCAL_FAKE_SECRET_BROKER === "1" && process.env.NODE_ENV !== "production";
  if (fakeEnabled) return localFakeStore ??= new InMemorySecretStore();
  const config = brokerConfig();
  const safeBrokerUrl = safeServiceUrl(config.url);
  if (safeBrokerUrl && config.token) return new HostedGeminiSecretStore(safeBrokerUrl.toString(), config.token);
  return null;
}

export async function getGeminiConnectionService() {
  const store = await getGeminiSecretStore();
  const fakeEnabled = process.env.NEGRONI_LOCAL_FAKE_SECRET_BROKER === "1" && process.env.NODE_ENV !== "production";
  return store ? createGeminiConnectionService(store, {
    verify: async (key) => {
      if (fakeEnabled) return { valid: key.length >= 20, verified_at: new Date().toISOString() };
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
        headers: { accept: "application/json", "x-goog-api-key": key }, signal: AbortSignal.timeout(15_000),
      });
      return { valid: response.ok, verified_at: response.ok ? new Date().toISOString() : null };
    },
  }) : null;
}
