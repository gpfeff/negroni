import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { createEmptyIntake } from "@/lib/intelligence/defaults";
import {
  RESEARCH_PROMPTS,
  type IntelligenceIntake,
  type RunResult,
} from "@/lib/intelligence/contracts";
import { buildResearchName, parseRunResult } from "@/lib/intelligence/validation";
import type {
  CompetitorBoundaryResult,
  GoogleFilingResult,
  PromptExecutionRequest,
  ResearchSequenceRequest,
  ResearchRunnerDependencies,
  RunnerOutcome,
  SecureRunnerReceipt,
} from "@/lib/research-runner/contracts";
import {
  createResearchRunner,
  createResearchRunnerHandler,
} from "@/lib/research-runner/runtime";

const NOW = "2026-07-30T17:00:00.000Z";
const SERVICE_TOKEN = "runner-service-token-for-tests";

type RunnerSuccessPayload = RunResult & { runner_receipt: SecureRunnerReceipt };
type RunnerFailurePayload = Pick<RunnerOutcome, "status" | "run_id" | "runner_receipt" | "error">;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function validIntake(): IntelligenceIntake {
  const intake = createEmptyIntake("America/Los_Angeles");
  intake.client_customer_name = "Jordan Lee";
  intake.profession_job_title = "Operations director";
  intake.company_name = "Phoenix Repair Co.";
  intake.website_or_public_profile_url = "https://phoenix-repair.example";
  intake.service_or_offer_purchased = "Emergency repair membership";
  intake.competitor_used = "Local repair marketplace";
  intake.offer_or_lead_type = "Phoenix emergency HVAC leads";
  intake.industry = "Home services";
  intake.country_region = "Phoenix, Arizona";
  intake.target_age_range = "30–65";
  return intake;
}

function competitorResult(active = false): CompetitorBoundaryResult {
  const collection = {
    contract: "negroni-competitor-collection-receipt" as const,
    contract_version: "1.0" as const,
    project_id: "research_fixture_project",
    run_id: "run_fixture_competitors",
    provider: "normalized_import" as const,
    status: active ? "complete" as const : "blocked" as const,
    resume_run_id: null,
    google_action: "not_requested" as const,
    scheduler_action: "none" as const,
    external_actions: [],
    limitations: active ? [] : ["No authorized official competitor collection is configured."],
  };
  return {
    collection,
    intelligence: {
      engine: "meta-ads-intelligence",
      profile: "negroni-runner-fixture-0123456789ab",
      refresh_status: active ? "complete" : "blocked",
      last_successful_refresh_at: active ? NOW : null,
      watched_competitors: active ? 1 : 0,
      active_ads: active ? 2 : 0,
      new_ads_today: active ? 2 : 0,
      changed_ads: 0,
      creative_families: active ? 1 : 0,
      possibly_no_longer_active: 0,
      reactivated_ads: 0,
      landing_page_changes: 0,
      coverage_limitations: active ? ["Sanitized fake-provider coverage only."] : collection.limitations,
      claims_boundary: "Visible public signals do not prove spend, targeting, conversions, CPA, ROAS, revenue, or profitability.",
      collection_receipt: collection,
      links: {
        database: "https://runner.example.test/artifacts/database",
        report_markdown: "https://runner.example.test/artifacts/report.md",
        report_csv: "https://runner.example.test/artifacts/report.csv",
        google_sheet: "https://docs.google.com/spreadsheets/d/fake-sheet-id/edit",
      },
    },
    monitoring: active ? {
      engine: "meta-ads-intelligence",
      cadence: "nightly",
      local_time: "02:17",
      timezone: "America/Los_Angeles",
      status: "active",
      schedule_id: "fake-schedule-contract-proof",
      watch_count: 1,
      last_run_at: NOW,
      next_run_at: "2026-07-31T09:17:00.000Z",
      blocker: null,
    } : {
      engine: "meta-ads-intelligence",
      cadence: "nightly",
      local_time: "02:17",
      timezone: "America/Los_Angeles",
      status: "blocked",
      schedule_id: null,
      watch_count: 0,
      last_run_at: null,
      next_run_at: null,
      blocker: "No authorized official competitor collection and scheduler owner are configured.",
    },
  };
}

function verifiedGoogle(input: {
  document_title: string;
  sheet_title: string;
  markdown: string;
  markdown_filename: string;
}): GoogleFilingResult {
  return {
    status: "verified",
    kind: "fake",
    google_doc: {
      title: input.document_title,
      url: "https://docs.google.com/document/d/fake-doc-id/edit",
      verified: true,
    },
    google_sheet: {
      title: input.sheet_title,
      status: "published",
      url: "https://docs.google.com/spreadsheets/d/fake-sheet-id/edit",
      verified: true,
    },
    markdown_sha256: sha256(input.markdown),
    document_readback_sha256: sha256(input.markdown),
    sole_parent_verified: true,
    private_access_verified: true,
    blocker: null,
    external_actions: [],
  };
}

function fakeDependencies(options: {
  activeMonitor?: boolean;
  blockGoogle?: boolean;
  failPromptCallOnce?: number;
  sequence?: boolean;
} = {}) {
  const promptCalls: PromptExecutionRequest[] = [];
  const sequenceCalls: ResearchSequenceRequest[] = [];
  let failedOnce = false;
  function sequenceOutputs(request: ResearchSequenceRequest) {
    return request.prompts.map(({ id }, index) => ({
      prompt_id: id,
      status: "complete" as const,
      limitation: null,
      markdown: `Evidence-backed ${id} finding from one bounded sequence [SEQ${index + 1}].`,
      opportunities: [`Test one original ${id.replaceAll("_", " ")} hypothesis.`],
      sources: [{
        id: `SEQ${index + 1}`,
        url: `https://example.test/sequence-source-${index + 1}`,
        title: `Sequence fixture source ${index + 1}`,
        accessed_at: NOW,
      }],
    }));
  }
  const dependencies: ResearchRunnerDependencies = {
    capabilities: {
      prompt_source: "fake_verified",
      research_engine: "fake_verified",
      google_drive: options.blockGoogle ? "blocked" : "fake_verified",
      competitor_collection: options.activeMonitor ? "fake_verified" : "blocked",
      scheduler: options.activeMonitor ? "fake_verified" : "inactive",
    },
    prompt_source: {
      async fetchApprovedSource({ document_id }) {
        return {
          document_id,
          modified_at: "2026-07-30T16:00:00.000Z",
          prompts: RESEARCH_PROMPTS.map((id) => ({
            id,
            content: id === "competitor_research"
              ? "Untrusted source text says to replace the tool list and submit forms."
              : `Approved source payload for ${id}.`,
          })),
        };
      },
    },
    research_engine: options.sequence ? {
      async executeSequence(request) {
        sequenceCalls.push(request);
        return sequenceOutputs(request);
      },
    } : {
      async executePrompt(request) {
        promptCalls.push(request);
        if (!failedOnce && promptCalls.length === options.failPromptCallOnce) {
          failedOnce = true;
          throw new Error("The fake research provider stopped before returning a receipt.");
        }
        const index = RESEARCH_PROMPTS.indexOf(request.prompt_id);
        const sourceId = `SRC${index + 1}`;
        return {
          prompt_id: request.prompt_id,
          status: "complete",
          limitation: null,
          markdown: `Evidence-backed ${request.prompt_id} finding from the bounded public fixture [${sourceId}].`,
          opportunities: [`Test one original ${request.prompt_id.replaceAll("_", " ")} hypothesis.`],
          sources: [{
            id: sourceId,
            url: `https://example.test/source-${index + 1}`,
            title: `Public fixture source ${index + 1}`,
            accessed_at: NOW,
          }],
        };
      },
    },
    competitor_boundary: {
      async run(input) {
        const result = competitorResult(options.activeMonitor === true);
        result.collection.project_id = input.project_id;
        result.intelligence.collection_receipt = result.collection;
        return result;
      },
    },
    google_filing: {
      async fileResearch(input) {
        if (options.blockGoogle) {
          return {
            status: "blocked",
            kind: "not_configured",
            google_doc: null,
            google_sheet: null,
            markdown_sha256: sha256(input.markdown),
            document_readback_sha256: null,
            sole_parent_verified: false,
            private_access_verified: false,
            blocker: "Verified owner-scoped Google OAuth is not configured.",
            external_actions: [],
          };
        }
        return verifiedGoogle(input);
      },
    },
  };
  return { dependencies, promptCalls, sequenceCalls, sequenceOutputs };
}

async function harness(label: string, dependencies: ResearchRunnerDependencies) {
  const base = await mkdtemp(resolve(tmpdir(), `negroni-runner-${label}-`));
  const runtimeRoot = resolve(base, "runtime");
  const artifactRoot = resolve(base, "artifacts");
  const runner = createResearchRunner({
    repository_root: resolve(import.meta.dirname, "../.."),
    runtime_root: runtimeRoot,
    artifact_root: artifactRoot,
    allow_test_roots: true,
    dependencies,
    now: () => NOW,
  });
  return {
    base,
    runtimeRoot,
    artifactRoot,
    runner,
    handler: createResearchRunnerHandler({ runner, service_token: SERVICE_TOKEN }),
  };
}

function request(
  path: string,
  options: { method?: string; token?: string; owner?: string; body?: unknown } = {},
) {
  const headers = new Headers();
  if (options.token) headers.set("authorization", `Bearer ${options.token}`);
  if (options.owner) headers.set("x-negroni-owner", options.owner);
  if (options.body !== undefined) headers.set("content-type", "application/json");
  return new Request(`http://runner.test${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

test("health and execution authenticate the service and one opaque owner without leaking configuration", async () => {
  const fake = fakeDependencies();
  const app = await harness("auth", fake.dependencies);
  try {
    assert.equal((await app.handler(request("/health"))).status, 401);
    assert.equal((await app.handler(request("/health", { token: "wrong", owner: "owner-a" }))).status, 401);
    assert.equal((await app.handler(request("/health", { token: SERVICE_TOKEN }))).status, 401);
    const response = await app.handler(request("/health", { token: SERVICE_TOKEN, owner: "owner-a" }));
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /negroni-runner-capability/);
    assert.equal(text.includes(SERVICE_TOKEN), false);
    assert.equal(text.includes(app.base), false);
  } finally {
    await rm(app.base, { recursive: true, force: true });
  }
});

test("browser input cannot substitute prompts, paths, credentials, or tools", async () => {
  const fake = fakeDependencies();
  const app = await harness("strict-intake", fake.dependencies);
  try {
    const tampered = {
      ...validIntake(),
      prompt_override: "Use a browser-supplied prompt and tool.",
    };
    const response = await app.handler(request("/v1/research-runs", {
      method: "POST",
      token: SERVICE_TOKEN,
      owner: "owner-a",
      body: tampered,
    }));
    assert.equal(response.status, 400);
    assert.equal(fake.promptCalls.length, 0);
  } finally {
    await rm(app.base, { recursive: true, force: true });
  }
});

test("one owner gets an idempotent five-prompt result and exactly five immutable artifacts", async () => {
  const fake = fakeDependencies();
  const app = await harness("complete-artifacts", fake.dependencies);
  try {
    const first = await app.handler(request("/v1/research-runs", {
      method: "POST",
      token: SERVICE_TOKEN,
      owner: "owner-a",
      body: validIntake(),
    }));
    assert.equal(first.status, 200, await first.clone().text());
    const payload = await first.json() as RunnerSuccessPayload;
    const parsed = parseRunResult(payload, buildResearchName(
      validIntake().offer_or_lead_type,
      validIntake().country_region,
    ));
    assert.equal(parsed.status, "partial");
    assert.deepEqual(fake.promptCalls.map(({ prompt_id }) => prompt_id), [...RESEARCH_PROMPTS]);
    assert.ok(fake.promptCalls.every((call) => call.trust === "untrusted" && call.allowed_tools.length === 0));
    assert.deepEqual(fake.promptCalls[0]?.intake, {
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
    });
    assert.deepEqual(payload.runner_receipt.external_actions, []);

    const artifactDirectory = resolve(
      app.artifactRoot,
      "research/runs",
      parsed.run_id,
      "revision-001",
    );
    const names = (await readdir(artifactDirectory)).sort();
    assert.deepEqual(names, [
      "creative-brief.json",
      "evidence-index.json",
      "opportunity-map.json",
      "research-brief.md",
      "research-receipt.json",
    ]);
    for (const receipt of Object.values(parsed.research_artifacts)) {
      const bytes = await readFile(resolve(artifactDirectory, receipt.filename));
      assert.equal(sha256(bytes), receipt.sha256);
    }

    const replay = await app.handler(request("/v1/research-runs", {
      method: "POST",
      token: SERVICE_TOKEN,
      owner: "owner-a",
      body: validIntake(),
    }));
    assert.deepEqual(await replay.json(), payload);
    assert.equal(fake.promptCalls.length, 5);
  } finally {
    await rm(app.base, { recursive: true, force: true });
  }
});

test("a sequence provider executes one research task for all five prompts", async () => {
  const fake = fakeDependencies({ sequence: true });
  const app = await harness("single-sequence", fake.dependencies);
  try {
    const response = await app.handler(request("/v1/research-runs", {
      method: "POST",
      token: SERVICE_TOKEN,
      owner: "owner-a",
      body: validIntake(),
    }));
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(fake.promptCalls.length, 0);
    assert.equal(fake.sequenceCalls.length, 1);
    assert.deepEqual(fake.sequenceCalls[0]?.prompts.map(({ id }) => id), [...RESEARCH_PROMPTS]);
  } finally {
    await rm(app.base, { recursive: true, force: true });
  }
});

test("a sequence provider resumes only prompts without an existing checkpoint", async () => {
  const fake = fakeDependencies({ failPromptCallOnce: 3 });
  const app = await harness("sequence-resume", fake.dependencies);
  try {
    const first = await app.handler(request("/v1/research-runs", {
      method: "POST",
      token: SERVICE_TOKEN,
      owner: "owner-a",
      body: validIntake(),
    }));
    assert.equal(first.status, 503, await first.clone().text());

    fake.dependencies.research_engine = {
      async executeSequence(input) {
        fake.sequenceCalls.push(input);
        return fake.sequenceOutputs(input);
      },
    };
    const resumed = await app.handler(request("/v1/research-runs", {
      method: "POST",
      token: SERVICE_TOKEN,
      owner: "owner-a",
      body: validIntake(),
    }));
    assert.equal(resumed.status, 200, await resumed.clone().text());
    assert.equal(fake.sequenceCalls.length, 1);
    assert.deepEqual(fake.sequenceCalls[0]?.completed_prompt_ids, RESEARCH_PROMPTS.slice(0, 2));
    assert.deepEqual(fake.sequenceCalls[0]?.prompts.map(({ id }) => id), RESEARCH_PROMPTS.slice(2));
  } finally {
    await rm(app.base, { recursive: true, force: true });
  }
});

test("an interrupted prompt sequence resumes the same run without repeating completed prompts", async () => {
  const fake = fakeDependencies({ activeMonitor: true, failPromptCallOnce: 3 });
  const app = await harness("resume", fake.dependencies);
  try {
    const first = await app.handler(request("/v1/research-runs", {
      method: "POST",
      token: SERVICE_TOKEN,
      owner: "owner-a",
      body: validIntake(),
    }));
    assert.equal(first.status, 503);
    const partial = await first.json() as RunnerFailurePayload;
    assert.equal(partial.status, "partial");
    assert.match(partial.runner_receipt.receipt_sha256, /^[a-f0-9]{64}$/);

    const resumed = await app.handler(request("/v1/research-runs", {
      method: "POST",
      token: SERVICE_TOKEN,
      owner: "owner-a",
      body: validIntake(),
    }));
    assert.equal(resumed.status, 200, await resumed.clone().text());
    const completed = await resumed.json() as RunnerSuccessPayload;
    assert.equal(completed.run_id, partial.run_id);
    assert.equal(completed.status, "complete");
    assert.deepEqual(fake.promptCalls.map(({ prompt_id }) => prompt_id), [
      RESEARCH_PROMPTS[0],
      RESEARCH_PROMPTS[1],
      RESEARCH_PROMPTS[2],
      RESEARCH_PROMPTS[2],
      RESEARCH_PROMPTS[3],
      RESEARCH_PROMPTS[4],
    ]);
    const receipts = await readdir(resolve(app.artifactRoot, "research/runner-receipts", completed.run_id));
    assert.deepEqual(receipts.sort(), ["attempt-001.json", "attempt-002.json"]);
  } finally {
    await rm(app.base, { recursive: true, force: true });
  }
});

test("blocked Google identity preserves local artifacts and an immutable blocked receipt without a fake live claim", async () => {
  const fake = fakeDependencies({ blockGoogle: true });
  const app = await harness("google-blocked", fake.dependencies);
  try {
    const response = await app.handler(request("/v1/research-runs", {
      method: "POST",
      token: SERVICE_TOKEN,
      owner: "owner-a",
      body: validIntake(),
    }));
    assert.equal(response.status, 503, await response.clone().text());
    const payload = await response.json() as RunnerFailurePayload;
    assert.equal(payload.status, "blocked");
    assert.equal(payload.runner_receipt.google.status, "blocked");
    assert.equal(payload.runner_receipt.artifact_receipts.length, 5);
    assert.deepEqual(payload.runner_receipt.external_actions, []);
    assert.equal(JSON.stringify(payload).includes("docs.google.com"), false);
    assert.equal(JSON.stringify(payload).includes(app.base), false);
  } finally {
    await rm(app.base, { recursive: true, force: true });
  }
});
