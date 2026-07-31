import assert from "node:assert/strict";
import test from "node:test";
import * as route from "../app/api/connections/gemini/route.ts";

test("Gemini connection routes reject unauthenticated callers", async () => {
  const request = new Request("https://example.com/api/connections/gemini");
  assert.equal((await route.GET(request)).status, 401);
  assert.equal((await route.PUT(request)).status, 401);
  assert.equal((await route.DELETE(request)).status, 401);
});

test("Gemini connection mutation rejects cross-origin requests", async () => {
  const request = new Request("http://localhost:3000/api/connections/gemini", {
    method: "PUT",
    headers: { origin: "https://attacker.example", "content-type": "application/json" },
    body: JSON.stringify({ api_key: "test-only-gemini-credential-abcdefghijklmnop", confirmation: "save" }),
  });
  assert.equal((await route.PUT(request)).status, 403);
});

test("Gemini connection mutation rejects a missing Origin", async () => {
  const request = new Request("http://localhost:3000/api/connections/gemini", {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ api_key: "test-only-gemini-credential-abcdefghijklmnop", confirmation: "save" }),
  });
  assert.equal((await route.PUT(request)).status, 403);
});
