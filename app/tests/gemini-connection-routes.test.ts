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

test("Gemini connection rejects a remote plaintext credential broker", async () => {
  const priorUrl = process.env.CREDENTIAL_BROKER_URL;
  const priorToken = process.env.CREDENTIAL_BROKER_TOKEN;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  process.env.CREDENTIAL_BROKER_URL = "http://broker.example.test";
  process.env.CREDENTIAL_BROKER_TOKEN = "gemini-broker-test-token";
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({}, { status: 500 });
  };
  try {
    const response = await route.GET(new Request("http://localhost:3000/api/connections/gemini"));
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { status?: string }).status, "connection_error");
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (priorUrl === undefined) delete process.env.CREDENTIAL_BROKER_URL; else process.env.CREDENTIAL_BROKER_URL = priorUrl;
    if (priorToken === undefined) delete process.env.CREDENTIAL_BROKER_TOKEN; else process.env.CREDENTIAL_BROKER_TOKEN = priorToken;
  }
});

test("Gemini disconnect does not claim success when the broker manages the credential", async () => {
  const priorUrl = process.env.CREDENTIAL_BROKER_URL;
  const priorToken = process.env.CREDENTIAL_BROKER_TOKEN;
  const originalFetch = globalThis.fetch;
  process.env.CREDENTIAL_BROKER_URL = "https://broker.example.test";
  process.env.CREDENTIAL_BROKER_TOKEN = "gemini-broker-test-token";
  globalThis.fetch = async () => Response.json(
    { changed: false, error: "Gemini is managed by the private service environment." },
    { status: 409 },
  );
  try {
    const response = await route.DELETE(new Request("http://localhost:3000/api/connections/gemini", {
      method: "DELETE",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ confirmation: "disconnect Gemini" }),
    }));
    assert.equal(response.status, 502);
    assert.match((await response.json() as { error?: string }).error ?? "", /could not be disconnected/i);
  } finally {
    globalThis.fetch = originalFetch;
    if (priorUrl === undefined) delete process.env.CREDENTIAL_BROKER_URL; else process.env.CREDENTIAL_BROKER_URL = priorUrl;
    if (priorToken === undefined) delete process.env.CREDENTIAL_BROKER_TOKEN; else process.env.CREDENTIAL_BROKER_TOKEN = priorToken;
  }
});
