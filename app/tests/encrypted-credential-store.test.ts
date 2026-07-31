import assert from "node:assert/strict";
import test from "node:test";
import { EncryptedD1SecretStore, credentialMetadata } from "@/lib/connections/encrypted-d1";
import type { Database } from "@/lib/database";

type Row = Record<string, string>;

function fakeDatabase() {
  const rows = new Map<string, Row>();
  const database: Database = {
    prepare(sql: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...next: unknown[]) { values = next; return statement; },
        async run() {
          if (sql.startsWith("INSERT INTO provider_secrets")) {
            const [ciphertext, iv, lastVerified, fingerprint, lastFour, updatedAt, owner, provider] = values.map(String);
            rows.set(`${owner}:${provider}`, { ciphertext, iv, last_verified_at: lastVerified, fingerprint, last_four: lastFour, updated_at: updatedAt });
          } else if (sql.startsWith("UPDATE provider_secrets")) {
            const [ciphertext, iv, lastVerified, fingerprint, lastFour, updatedAt, owner, provider] = values.map(String);
            rows.set(`${owner}:${provider}`, { ciphertext, iv, last_verified_at: lastVerified, fingerprint, last_four: lastFour, updated_at: updatedAt });
          } else if (sql.startsWith("DELETE FROM provider_secrets")) rows.delete(`${values[0]}:${values[1]}`);
          return { success: true, meta: { changes: 1 } };
        },
        async all<T>() {
          if (sql.startsWith("PRAGMA")) return { success: true, results: [] as T[] };
          const row = rows.get(`${values[0]}:${values[1]}`);
          return { success: true, results: (row ? [row] : []) as T[] };
        },
      };
      return statement;
    },
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); },
  };
  return { database, rows };
}

test("owner-scoped API credentials persist encrypted and decrypt only through the server store", async () => {
  const { database, rows } = fakeDatabase();
  const encryptionKey = Buffer.alloc(32, 7).toString("base64");
  const store = new EncryptedD1SecretStore(database, encryptionKey);
  const secret = "test-gemini-key-never-stored-in-plaintext";
  const metadata = credentialMetadata(secret, "2026-07-31T20:00:00.000Z");

  assert.equal(await store.create("owner@example.com", "gemini", secret, metadata), true);
  assert.equal(JSON.stringify([...rows.values()]).includes(secret), false);
  assert.equal(await store.read("owner@example.com", "gemini"), secret);
  assert.equal(await store.read("other@example.com", "gemini"), null);
  const savedMetadata = await store.metadata("owner@example.com", "gemini");
  assert.equal(savedMetadata?.last_verified_at, metadata.last_verified_at);
  assert.equal(savedMetadata?.fingerprint, metadata.fingerprint);
  assert.equal(savedMetadata?.last_four, metadata.last_four);
});
