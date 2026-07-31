import assert from "node:assert/strict";
import test from "node:test";
import {
  createGeminiConnectionService,
  InMemorySecretStore,
  type GeminiKeyVerifier,
} from "../lib/connections/gemini.ts";
import { createResearchApprovalService } from "../lib/research-runner/approval.ts";
import { InMemoryApprovalStore } from "../lib/research-runner/approval.ts";
import { GEMINI_DEEP_RESEARCH_AGENT } from "../lib/research-runner/gemini-deep-research.ts";

const KEY = "test-only-gemini-credential-abcdefghijklmnop";
const owner = "owner@example.com";
const verifier: GeminiKeyVerifier = { verify: async () => ({ valid: true, verified_at: "2026-07-31T18:00:00.000Z" }) };

test("Gemini connection responses expose metadata but never the submitted key", async () => {
  const service = createGeminiConnectionService(new InMemorySecretStore(), verifier);
  const saved = await service.save(owner, KEY, "save");
  const status = await service.status(owner);
  assert.equal(saved.status, "connected");
  assert.equal(status.status, "connected");
  assert.equal(JSON.stringify([saved, status]).includes(KEY), false);
  assert.equal(saved.last_four, "mnop");
});

test("invalid Gemini keys produce a useful redacted error and are not stored", async () => {
  const store = new InMemorySecretStore();
  const service = createGeminiConnectionService(store, { verify: async () => ({ valid: false, verified_at: null }) });
  await assert.rejects(service.save(owner, KEY, "save"), (error: Error) => error.message === "Gemini could not verify this API key. Check the key and try again.");
  assert.equal(await store.testOnlyValue(owner), null);
});

test("saving a key performs only verification and cannot start Deep Research", async () => {
  let verifies = 0;
  const service = createGeminiConnectionService(new InMemorySecretStore(), {
    verify: async () => { verifies += 1; return { valid: true, verified_at: "2026-07-31T18:00:00.000Z" }; },
  });
  await service.save(owner, KEY, "save");
  assert.equal(verifies, 1);
});

test("research start requires connection and approval for the exact run ID", async () => {
  const approvals = createResearchApprovalService(new InMemoryApprovalStore());
  const runA = "run_0123456789abcdef01234567";
  const runB = "run_aaaaaaaaaaaaaaaaaaaaaaaa";
  assert.equal(GEMINI_DEEP_RESEARCH_AGENT, "deep-research-preview-04-2026");
  await approvals.approve(owner, runA);
  await assert.rejects(approvals.authorizeStart(owner, runB, true), /exact run ID/);
  await assert.rejects(approvals.authorizeStart(owner, runA, false), /not connected/);
  assert.equal((await approvals.authorizeStart(owner, runA, true)).run_id, runA);
});

test("save cannot overwrite, replace cannot create, and failed replacement preserves the prior key", async () => {
  const store = new InMemorySecretStore();
  const service = createGeminiConnectionService(store, verifier);
  await service.save(owner, KEY, "save");
  await assert.rejects(service.save(owner, `${KEY}-other`, "save"), /already connected/);
  const prior = await store.testOnlyValue(owner);
  const failing = createGeminiConnectionService(store, { verify: async () => ({ valid: false, verified_at: null }) });
  await assert.rejects(failing.save(owner, `${KEY}-bad`, "replace"), /could not verify/);
  assert.equal(await store.testOnlyValue(owner), prior);
  await assert.rejects(service.save("new-owner@example.com", KEY, "replace"), /not connected/);
});

test("approval expires, is owner scoped, and concurrent consumption succeeds once", async () => {
  let time = new Date("2026-07-31T18:00:00.000Z");
  const approvals = createResearchApprovalService(new InMemoryApprovalStore(), () => time);
  const run = "run_0123456789abcdef01234567";
  await approvals.approve(owner, run);
  await assert.rejects(approvals.authorizeStart("other@example.com", run, true), /exact run ID/);
  const settled = await Promise.allSettled([approvals.authorizeStart(owner, run, true), approvals.authorizeStart(owner, run, true)]);
  assert.equal(settled.filter(({ status }) => status === "fulfilled").length, 1);
  const expired = createResearchApprovalService(new InMemoryApprovalStore(), () => time);
  await expired.approve(owner, run);
  time = new Date("2026-07-31T18:11:00.000Z");
  await assert.rejects(expired.authorizeStart(owner, run, true), /expired/);
});
