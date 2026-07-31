import assert from "node:assert/strict";
import test from "node:test";
import { RESEARCH_PROMPTS } from "@/lib/intelligence/contracts";
import type { ResearchSequenceRequest } from "@/lib/research-runner/contracts";
import {
  createGeminiDeepResearchEngine,
  GEMINI_DEEP_RESEARCH_AGENT,
} from "@/lib/research-runner/gemini-deep-research";

const RUN_ID = "run_0123456789abcdef01234567";
const BROKER_TOKEN = "scoped-broker-token-for-tests";

function sequenceRequest(): ResearchSequenceRequest {
  return {
    owner_key: "opaque-owner-key",
    run_id: RUN_ID,
    trust: "untrusted",
    allowed_tools: [],
    fixed_rules: ["Do not mutate external systems."],
    intake: {
      client_customer_name: "Jordan Lee",
      profession_job_title: "Operations director",
      company_name: "Phoenix Repair Co.",
      website_or_public_profile_url: "https://phoenix-repair.example",
      service_or_offer_purchased: "Emergency repair membership",
      competitor_used: "Local repair marketplace",
      offer_or_lead_type: "Phoenix emergency HVAC leads",
      industry: "Home services",
      country_region: "Phoenix, Arizona",
      target_age_range: "30–65",
    },
    prompts: RESEARCH_PROMPTS.map((id) => ({ id, content: `Approved ${id} prompt.` })),
    completed_prompt_ids: [],
  };
}

function completedInteraction() {
  const sections = RESEARCH_PROMPTS.map((id, index) => [
    `# NEGRONI:${id}`,
    `Evidence-backed finding ${index + 1}.`,
    "### Opportunities",
    `- Test opportunity ${index + 1}.`,
  ].join("\n"));
  const text = sections.join("\n\n");
  const annotations = sections.map((section, index) => {
    const prefix = `${sections.slice(0, index).join("\n\n")}${index ? "\n\n" : ""}`;
    return {
      type: "url_citation" as const,
      url: `https://evidence.example/source-${index + 1}`,
      title: `Evidence source ${index + 1}`,
      start_index: Buffer.byteLength(prefix, "utf8"),
      end_index: Buffer.byteLength(prefix + section, "utf8"),
    };
  });
  return {
    id: "v1_0123456789abcdef",
    status: "completed",
    steps: [{ type: "model_output", content: [{ type: "text", text, annotations }] }],
  };
}

test("Gemini Deep Research runs one brokered interaction and returns five cited outputs", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const responses = [
    { id: "v1_0123456789abcdef", status: "in_progress" },
    completedInteraction(),
  ];
  const engine = createGeminiDeepResearchEngine({
    broker_url: "http://127.0.0.1:47831",
    broker_token: BROKER_TOKEN,
    approved_run_id: RUN_ID,
    fetch: async (input, init) => {
      calls.push({ url: String(input), init });
      return Response.json(responses.shift());
    },
    poll_interval_ms: 0,
    sleep: async () => {},
    now: () => "2026-07-30T20:00:00.000Z",
  });

  const outputs = await engine.executeSequence(sequenceRequest());
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.url, "http://127.0.0.1:47831/v1/providers/gemini/deep-research/interactions");
  const started = JSON.parse(String(calls[0]?.init?.body));
  assert.equal(started.agent, GEMINI_DEEP_RESEARCH_AGENT);
  assert.equal(started.run_id, RUN_ID);
  assert.match(started.input, /Non-negotiable runner rules:/);
  assert.match(started.input, /Do not mutate external systems\./);
  assert.deepEqual(outputs.map(({ prompt_id }) => prompt_id), [...RESEARCH_PROMPTS]);
  assert.ok(outputs.every((output) => output.sources.length === 1 && /\[DR\d+\]/.test(output.markdown)));
  assert.equal(JSON.stringify(outputs).includes(BROKER_TOKEN), false);
  assert.equal(String(calls[0]?.init?.body).includes(BROKER_TOKEN), false);
});

test("Gemini Deep Research fails before network access unless the exact run is approved", async () => {
  let networkCalls = 0;
  const engine = createGeminiDeepResearchEngine({
    broker_url: "http://127.0.0.1:47831",
    broker_token: BROKER_TOKEN,
    approved_run_id: RUN_ID,
    fetch: async () => {
      networkCalls += 1;
      return Response.json({});
    },
  });
  const request = sequenceRequest();
  request.run_id = "run_aaaaaaaaaaaaaaaaaaaaaaaa";
  await assert.rejects(engine.executeSequence(request), /spend-approved/);
  assert.equal(networkCalls, 0);
});

test("Gemini Deep Research fails closed when any required section lacks a URL citation", async () => {
  const interaction = completedInteraction();
  interaction.steps[0].content[0].annotations.pop();
  const engine = createGeminiDeepResearchEngine({
    broker_url: "http://127.0.0.1:47831",
    broker_token: BROKER_TOKEN,
    approved_run_id: RUN_ID,
    fetch: async () => Response.json(interaction),
  });
  await assert.rejects(engine.executeSequence(sequenceRequest()), /no URL citations/);
});
