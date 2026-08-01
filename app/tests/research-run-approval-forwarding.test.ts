import assert from "node:assert/strict";
import test from "node:test";
import { executeApprovedResearch, GET } from "@/app/api/run/route";
import { createEmptyIntake } from "@/lib/intelligence/defaults";

const APPROVED_RUN_ID = "run_0123456789abcdef01234567";

function validIntake() {
  const intake = createEmptyIntake("America/Los_Angeles");
  intake.profession = "HVAC contractor";
  intake.job_title = "Operations director";
  intake.company_name = "Phoenix Repair Co.";
  intake.website_or_public_profile_url = "https://phoenix-repair.example";
  intake.competitor_used = "Local repair marketplace";
  intake.offer_or_lead_type = "Phoenix emergency HVAC leads";
  intake.industry = "Home services";
  intake.country_region = "Phoenix, Arizona";
  return intake;
}

test("approved research forwards the consumed exact run ID only in a server header", async () => {
  const priorUrl = process.env.LEAD_INTELLIGENCE_RUNNER_URL;
  const priorToken = process.env.LEAD_INTELLIGENCE_RUNNER_TOKEN;
  const priorFetch = globalThis.fetch;
  process.env.LEAD_INTELLIGENCE_RUNNER_URL = "http://127.0.0.1:47832/v1/research-runs";
  process.env.LEAD_INTELLIGENCE_RUNNER_TOKEN = "runner-service-token-for-tests";
  const captured: Array<{ headers: Headers; body: string }> = [];
  globalThis.fetch = async (_input, init) => {
    captured.push({
      headers: new Headers(init?.headers),
      body: String(init?.body),
    });
    return Response.json({ status: "blocked" }, { status: 503 });
  };
  try {
    const response = await executeApprovedResearch("owner@example.test", APPROVED_RUN_ID, validIntake(), {
      brand_id: "brand-123",
      offer_id: "offer-456",
    });
    assert.equal(response.status, 502);
    assert.equal(captured[0]?.headers.get("x-negroni-approved-run-id"), APPROVED_RUN_ID);
    assert.equal(captured[0]?.headers.get("x-negroni-brand-id"), "brand-123");
    assert.equal(captured[0]?.headers.get("x-negroni-offer-id"), "offer-456");
    assert.equal(captured[0]?.body.includes(APPROVED_RUN_ID), false);
  } finally {
    globalThis.fetch = priorFetch;
    if (priorUrl === undefined) delete process.env.LEAD_INTELLIGENCE_RUNNER_URL;
    else process.env.LEAD_INTELLIGENCE_RUNNER_URL = priorUrl;
    if (priorToken === undefined) delete process.env.LEAD_INTELLIGENCE_RUNNER_TOKEN;
    else process.env.LEAD_INTELLIGENCE_RUNNER_TOKEN = priorToken;
  }
});

test("run readiness reflects an authenticated live runner health check", async () => {
  const priorUrl = process.env.LEAD_INTELLIGENCE_RUNNER_URL;
  const priorToken = process.env.LEAD_INTELLIGENCE_RUNNER_TOKEN;
  const priorFetch = globalThis.fetch;
  process.env.LEAD_INTELLIGENCE_RUNNER_URL = "http://127.0.0.1:47832/v1/research-runs";
  process.env.LEAD_INTELLIGENCE_RUNNER_TOKEN = "runner-service-token-for-tests";
  const calls: Array<{ url: string; headers: Headers }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    return Response.json({
      contract: "negroni-runner-capability",
      state: "locally_verified_not_deployed",
      capabilities: { prompt_source: "configured", research_engine: "configured", google_drive: "configured" },
    });
  };
  try {
    const response = await GET(new Request("http://127.0.0.1/api/run"));
    assert.deepEqual(await response.json(), { available: true, status: "ready", blocker: null });
    assert.equal(calls[0]?.url, "http://127.0.0.1:47832/health");
    assert.equal(calls[0]?.headers.get("x-negroni-owner"), "local-preview");

    globalThis.fetch = async () => { throw new Error("runner offline"); };
    const blocked = await GET(new Request("http://127.0.0.1/api/run"));
    const body = await blocked.json() as { available: boolean; status: string; blocker: string | null };
    assert.equal(body.available, false);
    assert.equal(body.status, "blocked");
    assert.ok(body.blocker);
  } finally {
    globalThis.fetch = priorFetch;
    if (priorUrl === undefined) delete process.env.LEAD_INTELLIGENCE_RUNNER_URL;
    else process.env.LEAD_INTELLIGENCE_RUNNER_URL = priorUrl;
    if (priorToken === undefined) delete process.env.LEAD_INTELLIGENCE_RUNNER_TOKEN;
    else process.env.LEAD_INTELLIGENCE_RUNNER_TOKEN = priorToken;
  }
});
