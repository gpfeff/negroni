import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import {
  PROMPT_SOURCE_DOCUMENT_ID,
  RESEARCH_PROMPTS,
} from "@/lib/intelligence/contracts";
import { createDefaultResearchRunnerDependencies } from "@/lib/research-runner/defaults";
import type { GoogleFilingInput } from "@/lib/research-runner/contracts";

test("the local runner exposes one embedded five-step prompt source without browser retrieval", async () => {
  const priorMode = process.env.NEGRONI_PROMPT_SOURCE_MODE;
  process.env.NEGRONI_PROMPT_SOURCE_MODE = "embedded";
  try {
    const dependencies = createDefaultResearchRunnerDependencies();
    assert.equal(dependencies.capabilities.prompt_source, "configured");
    const source = await dependencies.prompt_source.fetchApprovedSource({
      owner_key: "opaque-owner",
      document_id: PROMPT_SOURCE_DOCUMENT_ID,
    });
    assert.equal(source.document_id, PROMPT_SOURCE_DOCUMENT_ID);
    assert.deepEqual(source.prompts.map(({ id }) => id), [...RESEARCH_PROMPTS]);
    assert.ok(source.prompts.every(({ content }) => content.length >= 100));
    assert.match(source.prompts[3]!.content, /steps 1.?3/i);
    assert.match(source.prompts[4]!.content, /Master Research/i);
  } finally {
    if (priorMode === undefined) delete process.env.NEGRONI_PROMPT_SOURCE_MODE;
    else process.env.NEGRONI_PROMPT_SOURCE_MODE = priorMode;
  }
});

test("the default runner files research through the authenticated local Drive broker", async () => {
  const brokerToken = "default-runner-broker-token";
  let received: { authorization?: string; path?: string; body?: GoogleFilingInput } = {};
  const broker = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as GoogleFilingInput;
    received = { authorization: request.headers.authorization, path: request.url, body };
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      status: "verified",
      kind: "live",
      google_doc: { title: body.document_title, url: "https://docs.google.com/document/d/doc-id/edit", verified: true },
      google_sheet: { title: body.sheet_title, status: "not_configured", url: null, verified: false, message: "Google publishing not configured." },
      folder_name: `Negroni / ${body.brand_name} / ${body.offer_name}`,
      folder_url: "https://drive.google.com/drive/folders/offer-folder",
      markdown_sha256: createHash("sha256").update(body.markdown).digest("hex"),
      document_readback_sha256: createHash("sha256").update(body.markdown).digest("hex"),
      sole_parent_verified: true,
      private_access_verified: true,
      blocker: null,
      external_actions: ["google_files_created"],
    }));
  });
  await new Promise<void>((resolvePromise) => broker.listen(0, "127.0.0.1", resolvePromise));
  const address = broker.address();
  assert.ok(address && typeof address === "object");
  const priorUrl = process.env.CREDENTIAL_BROKER_URL;
  const priorToken = process.env.CREDENTIAL_BROKER_TOKEN;
  process.env.CREDENTIAL_BROKER_URL = `http://127.0.0.1:${address.port}`;
  process.env.CREDENTIAL_BROKER_TOKEN = brokerToken;
  try {
    const dependencies = createDefaultResearchRunnerDependencies();
    assert.equal(dependencies.capabilities.google_drive, "configured");
    const input: GoogleFilingInput = {
      owner_key: "opaque-owner",
      run_id: "run_0123456789abcdef01234567",
      brand_id: "brand-123",
      offer_id: "offer-456",
      brand_name: "Phoenix Repair Co.",
      offer_name: "Emergency HVAC Leads",
      document_title: "Emergency HVAC Leads — Master Research",
      sheet_title: "Emergency HVAC Leads — Competitor Ads",
      markdown_filename: "emergency-hvac-leads-master-research.md",
      markdown: "# Master Research\n\nEvidence-backed fixture content [SRC1].\n",
      sources: [{ id: "SRC1", url: "https://example.test/source", title: "Source", accessed_at: "2026-07-31T00:00:00.000Z" }],
      competitor_collection: {
        contract: "negroni-competitor-collection-receipt",
        contract_version: "1.0",
        project_id: "project-fixture",
        run_id: "collection-fixture",
        provider: "normalized_import",
        status: "skipped",
        resume_run_id: null,
        google_action: "not_requested",
        scheduler_action: "none",
        external_actions: [],
        limitations: [],
      },
      create_competitor_database: false,
    };
    const result = await dependencies.google_filing.fileResearch(input);
    assert.equal(result.status, "verified");
    assert.equal(received.authorization, `Bearer ${brokerToken}`);
    assert.equal(received.path, "/v1/providers/google-drive/file-research");
    assert.equal(received.body?.create_competitor_database, false);
  } finally {
    if (priorUrl === undefined) delete process.env.CREDENTIAL_BROKER_URL;
    else process.env.CREDENTIAL_BROKER_URL = priorUrl;
    if (priorToken === undefined) delete process.env.CREDENTIAL_BROKER_TOKEN;
    else process.env.CREDENTIAL_BROKER_TOKEN = priorToken;
    await new Promise<void>((resolvePromise, reject) => broker.close((error) => error ? reject(error) : resolvePromise()));
  }
});
