import { createHash } from "node:crypto";
import { ensureResearchSchema, type Database } from "@/lib/database";

export const API_KEY_PROVIDERS = ["gemini", "kie_ai", "apify"] as const;
export type ApiKeyProvider = (typeof API_KEY_PROVIDERS)[number];
export type SecretMetadata = { last_verified_at: string; fingerprint: string; last_four: string };

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

function bufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function encryptionKey(encoded: string): Promise<CryptoKey> {
  const bytes = base64ToBytes(encoded);
  if (bytes.byteLength !== 32) throw new Error("The credential encryption key is invalid.");
  return crypto.subtle.importKey("raw", bufferSource(bytes), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export class EncryptedD1SecretStore {
  constructor(private readonly database: Database, private readonly encodedKey: string) {}

  async metadata(owner: string, provider: ApiKeyProvider): Promise<SecretMetadata | null> {
    await ensureResearchSchema(this.database);
    const result = await this.database.prepare(
      "SELECT last_verified_at, fingerprint, last_four FROM provider_secrets WHERE owner_email = ? AND provider = ? LIMIT 1",
    ).bind(owner, provider).all<SecretMetadata>();
    return result.results?.[0] ?? null;
  }

  async read(owner: string, provider: ApiKeyProvider): Promise<string | null> {
    await ensureResearchSchema(this.database);
    const result = await this.database.prepare(
      "SELECT ciphertext, iv FROM provider_secrets WHERE owner_email = ? AND provider = ? LIMIT 1",
    ).bind(owner, provider).all<{ ciphertext: string; iv: string }>();
    const row = result.results?.[0];
    if (!row) return null;
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bufferSource(base64ToBytes(row.iv)), additionalData: new TextEncoder().encode(`${owner}:${provider}`) },
      await encryptionKey(this.encodedKey),
      bufferSource(base64ToBytes(row.ciphertext)),
    );
    return new TextDecoder().decode(plaintext);
  }

  async create(owner: string, provider: ApiKeyProvider, value: string, metadata: SecretMetadata): Promise<boolean> {
    if (await this.metadata(owner, provider)) return false;
    return this.write(owner, provider, value, metadata, false);
  }

  async replace(owner: string, provider: ApiKeyProvider, value: string, metadata: SecretMetadata): Promise<boolean> {
    if (!await this.metadata(owner, provider)) return false;
    return this.write(owner, provider, value, metadata, true);
  }

  private async write(owner: string, provider: ApiKeyProvider, value: string, metadata: SecretMetadata, replace: boolean): Promise<boolean> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(`${owner}:${provider}`) },
      await encryptionKey(this.encodedKey),
      new TextEncoder().encode(value),
    );
    const sql = replace
      ? "UPDATE provider_secrets SET ciphertext = ?, iv = ?, last_verified_at = ?, fingerprint = ?, last_four = ?, updated_at = ? WHERE owner_email = ? AND provider = ?"
      : "INSERT INTO provider_secrets (ciphertext, iv, last_verified_at, fingerprint, last_four, updated_at, owner_email, provider) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    const result = await this.database.prepare(sql).bind(
      bytesToBase64(new Uint8Array(ciphertext)), bytesToBase64(iv), metadata.last_verified_at,
      metadata.fingerprint, metadata.last_four, new Date().toISOString(), owner, provider,
    ).run();
    return result.success && (result.meta?.changes ?? 1) > 0;
  }

  async delete(owner: string, provider: ApiKeyProvider): Promise<boolean> {
    await ensureResearchSchema(this.database);
    const result = await this.database.prepare("DELETE FROM provider_secrets WHERE owner_email = ? AND provider = ?")
      .bind(owner, provider).run();
    return result.success && (result.meta?.changes ?? 0) > 0;
  }
}

export function credentialMetadata(value: string, verifiedAt = new Date().toISOString()): SecretMetadata {
  return {
    last_verified_at: verifiedAt,
    fingerprint: createHash("sha256").update(value).digest("hex").slice(0, 12),
    last_four: value.slice(-4),
  };
}
