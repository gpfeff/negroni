import assert from "node:assert/strict";
import test from "node:test";
import * as route from "@/app/api/settings/route";

const brokerResponse = {
  available: true,
  blocker: null,
  providers: [
    { provider: "codex_cli", status: "connected", blocker: null },
    { provider: "claude_code", status: "not_connected", blocker: null },
    { provider: "gemini_api", status: "not_connected", blocker: null },
    { provider: "gemini_oauth", status: "not_connected", blocker: null },
    { provider: "kie_ai", status: "not_connected", blocker: null },
    { provider: "apify", status: "not_connected", blocker: null },
    { provider: "google_drive", status: "blocked", blocker: "Google Drive is not configured.", auto_store: false },
  ],
};

async function withBrokerEnvironment(run: () => Promise<void>) {
  const prior = {
    url: process.env.CREDENTIAL_BROKER_URL,
    token: process.env.CREDENTIAL_BROKER_TOKEN,
  };
  process.env.CREDENTIAL_BROKER_URL = "https://broker.example.test";
  process.env.CREDENTIAL_BROKER_TOKEN = "settings-broker-token";
  try { await run(); } finally {
    if (prior.url === undefined) delete process.env.CREDENTIAL_BROKER_URL; else process.env.CREDENTIAL_BROKER_URL = prior.url;
    if (prior.token === undefined) delete process.env.CREDENTIAL_BROKER_TOKEN; else process.env.CREDENTIAL_BROKER_TOKEN = prior.token;
  }
}

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

test("provider settings prefer the owner-scoped broker when it is configured", async () => {
  await withBrokerEnvironment(async () => {
    const originalFetch = globalThis.fetch;
    let observed: { url?: string; owner?: string } = {};
    globalThis.fetch = async (input, init) => {
      observed = {
        url: String(input),
        owner: new Headers(init?.headers).get("x-negroni-owner") ?? undefined,
      };
      return Response.json(brokerResponse);
    };
    try {
      const response = await route.GET(new Request("http://localhost:3000/api/settings"));
      assert.equal(response.status, 200, await response.clone().text());
      assert.equal(observed.url, "https://broker.example.test/v1/providers/status");
      assert.equal(observed.owner, "b1a49589e5175cee1bc14178def0201b4a60139b4ac9c9f2a0716d67d72960e0");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("provider settings disconnect through the configured owner-scoped broker", async () => {
  await withBrokerEnvironment(async () => {
    const originalFetch = globalThis.fetch;
    let observed: { method?: string; owner?: string; body?: string } = {};
    globalThis.fetch = async (_input, init) => {
      observed = {
        method: init?.method,
        owner: new Headers(init?.headers).get("x-negroni-owner") ?? undefined,
        body: String(init?.body ?? ""),
      };
      return Response.json({ connected: false, message: "API credential disconnected." });
    };
    try {
      const response = await route.DELETE(new Request("http://localhost:3000/api/settings", {
        method: "DELETE",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ provider: "apify", confirmation: "disconnect apify" }),
      }));
      assert.equal(response.status, 200, await response.clone().text());
      assert.equal(observed.method, "DELETE");
      assert.equal(observed.owner, "b1a49589e5175cee1bc14178def0201b4a60139b4ac9c9f2a0716d67d72960e0");
      assert.deepEqual(JSON.parse(observed.body ?? "{}"), { provider: "apify" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("provider settings require explicit save or replace confirmation before broker access", async () => {
  await withBrokerEnvironment(async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    let forwarded = "";
    globalThis.fetch = async (_input, init) => {
      calls += 1;
      forwarded = String(init?.body ?? "");
      return Response.json({ connected: true, message: "Connected." });
    };
    try {
      const request = (confirmation?: string) => new Request("http://localhost:3000/api/settings", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ provider: "apify", api_key: "apify_api_test_token_never_returned", confirmation }),
      });
      assert.equal((await route.POST(request())).status, 400);
      assert.equal(calls, 0);
      assert.equal((await route.POST(request("save"))).status, 200);
      assert.equal(calls, 1);
      assert.equal(JSON.parse(forwarded).confirmation, "save");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("provider settings reject a remote plaintext broker endpoint", async () => {
  await withBrokerEnvironment(async () => {
    process.env.CREDENTIAL_BROKER_URL = "http://broker.example.test";
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return Response.json(brokerResponse);
    };
    try {
      const response = await route.GET(new Request("http://localhost:3000/api/settings"));
      assert.equal(response.status, 503);
      assert.equal(calls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("provider settings fail cleanly for malformed mutations and an unreachable broker", async () => {
  await withBrokerEnvironment(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("private upstream detail"); };
    try {
      const status = await route.GET(new Request("http://localhost:3000/api/settings"));
      assert.equal(status.status, 502);
      assert.deepEqual(await status.json(), { error: "Provider status could not be verified." });

      const malformedPost = await route.POST(new Request("http://localhost:3000/api/settings", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: "{",
      }));
      assert.equal(malformedPost.status, 400);

      const malformedDelete = await route.DELETE(new Request("http://localhost:3000/api/settings", {
        method: "DELETE",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: "{",
      }));
      assert.equal(malformedDelete.status, 400);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
