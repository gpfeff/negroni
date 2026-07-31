import assert from "node:assert/strict";
import test from "node:test";
import * as route from "@/app/api/settings/route";

test("API-key settings mutations reject unauthenticated and cross-origin callers", async () => {
  const unauthenticated = await route.POST(new Request("https://example.com/api/settings", { method: "POST" }));
  assert.equal(unauthenticated.status, 401);

  const crossOrigin = await route.POST(new Request("http://localhost:3000/api/settings", {
    method: "POST",
    headers: { origin: "https://attacker.example", "content-type": "application/json" },
    body: JSON.stringify({ provider: "apify", api_key: "test-key-never-accepted-abcdefghijklmnop", confirmation: "save" }),
  }));
  assert.equal(crossOrigin.status, 403);
});
