import { createGeminiConnectionService, InMemorySecretStore, type SecretStore } from "./gemini.ts";

export const GEMINI_BROKER_BLOCKER = "Secure hosted Gemini storage is not configured. Connect a 1Password-backed server credential broker before saving a key.";

function brokerConfig() {
  return { url: process.env.CREDENTIAL_BROKER_URL?.trim() ?? "", token: process.env.CREDENTIAL_BROKER_TOKEN?.trim() ?? "" };
}

class HostedGeminiSecretStore implements SecretStore {
  constructor(private readonly url: string, private readonly token: string) {}
  async request(owner: string, method: string, body?: unknown) {
    const response = await fetch(new URL("/v1/secrets/gemini", this.url), {
      method,
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json", "x-negroni-owner": owner },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 404 || response.status === 409) return { changed: false, metadata: null };
    if (!response.ok) throw new Error("Credential broker request failed.");
    return await response.json() as { changed?: boolean; metadata?: { last_verified_at: string | null; fingerprint: string | null; last_four: string | null } | null };
  }
  async metadata(owner: string) { return (await this.request(owner, "GET")).metadata ?? null; }
  async create(owner: string, _name: "gemini", value: string, metadata: Parameters<SecretStore["create"]>[3]) {
    return (await this.request(owner, "POST", { api_key: value, metadata })).changed === true;
  }
  async replace(owner: string, _name: "gemini", value: string, metadata: Parameters<SecretStore["replace"]>[3]) {
    return (await this.request(owner, "PUT", { api_key: value, metadata })).changed === true;
  }
  async delete(owner: string) { return (await this.request(owner, "DELETE")).changed === true; }
}

const config = brokerConfig();
const fakeEnabled = process.env.NEGRONI_LOCAL_FAKE_SECRET_BROKER === "1" && process.env.NODE_ENV !== "production";
const store = fakeEnabled ? new InMemorySecretStore() : config.url && config.token ? new HostedGeminiSecretStore(config.url, config.token) : null;

export const geminiConnectionService = store
  ? createGeminiConnectionService(store, {
      // Non-generative capability check. This endpoint lists models and cannot start research.
      verify: async (key) => {
        if (fakeEnabled) return { valid: key.length >= 20, verified_at: new Date().toISOString() };
        const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
          headers: { accept: "application/json", "x-goog-api-key": key }, signal: AbortSignal.timeout(15_000),
        });
        return { valid: response.ok, verified_at: response.ok ? new Date().toISOString() : null };
      },
    })
  : null;
