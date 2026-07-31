import { createHash } from "node:crypto";

export type GeminiConnectionMetadata = {
  status: "not_connected" | "connected" | "connection_error";
  last_verified_at: string | null;
  fingerprint: string | null;
  last_four: string | null;
};

type StoredMetadata = Omit<GeminiConnectionMetadata, "status">;

export interface SecretStore {
  metadata(owner: string, name: "gemini"): Promise<StoredMetadata | null>;
  create(owner: string, name: "gemini", value: string, metadata: StoredMetadata): Promise<boolean>;
  replace(owner: string, name: "gemini", value: string, metadata: StoredMetadata): Promise<boolean>;
  delete(owner: string, name: "gemini"): Promise<boolean>;
  read?(owner: string, name: "gemini"): Promise<string | null>;
}

export interface GeminiKeyVerifier {
  verify(key: string): Promise<{ valid: boolean; verified_at: string | null }>;
}

export class InMemorySecretStore implements SecretStore {
  readonly #values = new Map<string, { value: string; metadata: StoredMetadata }>();
  async metadata(owner: string, name: "gemini") { return this.#values.get(`${owner}:${name}`)?.metadata ?? null; }
  async create(owner: string, name: "gemini", value: string, metadata: StoredMetadata) {
    const key = `${owner}:${name}`;
    if (this.#values.has(key)) return false;
    this.#values.set(key, { value, metadata });
    return true;
  }
  async replace(owner: string, name: "gemini", value: string, metadata: StoredMetadata) {
    const key = `${owner}:${name}`;
    if (!this.#values.has(key)) return false;
    this.#values.set(key, { value, metadata });
    return true;
  }
  async delete(owner: string, name: "gemini") { return this.#values.delete(`${owner}:${name}`); }
  async read(owner: string) { return this.#values.get(`${owner}:gemini`)?.value ?? null; }
  async testOnlyValue(owner: string) { return this.#values.get(`${owner}:gemini`)?.value ?? null; }
}

const CONNECTION_ERROR = "Gemini connection could not be completed. No credential change was made.";

export function createGeminiConnectionService(store: SecretStore, verifier: GeminiKeyVerifier) {
  return {
    async status(owner: string): Promise<GeminiConnectionMetadata> {
      try {
        const safe = await store.metadata(owner, "gemini");
        return safe ? { status: "connected", ...safe } : { status: "not_connected", last_verified_at: null, fingerprint: null, last_four: null };
      } catch { throw new Error("Gemini connection status is temporarily unavailable."); }
    },
    async save(owner: string, rawKey: string, mode: "save" | "replace"): Promise<GeminiConnectionMetadata> {
      const key = rawKey.trim();
      if (key.length < 20 || key.length > 512) throw new Error("Enter a valid Gemini API key.");
      let result: Awaited<ReturnType<GeminiKeyVerifier["verify"]>>;
      try { result = await verifier.verify(key); } catch { throw new Error("Gemini verification could not be completed. The key was not saved."); }
      if (!result.valid || !result.verified_at) throw new Error("Gemini could not verify this API key. Check the key and try again.");
      const safe = {
        last_verified_at: result.verified_at,
        fingerprint: createHash("sha256").update(key).digest("hex").slice(0, 12),
        last_four: key.slice(-4),
      };
      try {
        const changed = mode === "save"
          ? await store.create(owner, "gemini", key, safe)
          : await store.replace(owner, "gemini", key, safe);
        if (!changed) throw new Error(mode === "save" ? "Gemini is already connected. Use Replace key." : "Gemini is not connected. Use Save and verify.");
      } catch (error) {
        if (error instanceof Error && (error.message.startsWith("Gemini is already") || error.message.startsWith("Gemini is not"))) throw error;
        throw new Error(CONNECTION_ERROR);
      }
      return { status: "connected", ...safe };
    },
    async disconnect(owner: string) {
      try { await store.delete(owner, "gemini"); } catch { throw new Error("Gemini could not be disconnected. No credential change was confirmed."); }
      return { status: "not_connected", last_verified_at: null, fingerprint: null, last_four: null } satisfies GeminiConnectionMetadata;
    },
  };
}
