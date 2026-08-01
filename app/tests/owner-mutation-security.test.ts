import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { POST as mutateProfile, DELETE as deleteProfile } from "@/app/api/profiles/route";
import { POST as mutateReview } from "@/app/api/review/route";

const endpoints = [
  ["brand and offer save", mutateProfile, "POST"],
  ["brand and offer delete", deleteProfile, "DELETE"],
  ["research review edit", mutateReview, "POST"],
] as const;

for (const [label, handler, method] of endpoints) {
  test(`${label} rejects a request without a matching browser origin`, async () => {
    const response = await handler(new Request(`http://localhost:3000/api/${label.replaceAll(" ", "-")}`, {
      method,
      headers: { "content-type": "application/json" },
      body: "{}",
    }));
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "A same-origin request is required." });
  });
}

test("research review mutations use the bounded request parser", async () => {
  const source = await readFile(resolve(process.cwd(), "app/api/review/route.ts"), "utf8");
  assert.match(source, /boundedJson\(request/);
  assert.doesNotMatch(source, /request\.json\(\)/);
});

test("provider credentials have no D1 storage path", async () => {
  const [settingsRoute, connectionRuntime, databaseSchema] = await Promise.all([
    readFile(resolve(process.cwd(), "app/api/settings/route.ts"), "utf8"),
    readFile(resolve(process.cwd(), "lib/connections/runtime.ts"), "utf8"),
    readFile(resolve(process.cwd(), "db/schema.ts"), "utf8"),
  ]);
  assert.doesNotMatch(settingsRoute, /EncryptedD1SecretStore|provider_secrets|NEGRONI_SECRET_ENCRYPTION_KEY/);
  assert.doesNotMatch(connectionRuntime, /EncryptedD1SecretStore|provider_secrets|NEGRONI_SECRET_ENCRYPTION_KEY/);
  assert.doesNotMatch(databaseSchema, /CREATE_PROVIDER_SECRETS|provider_secrets/);
});
