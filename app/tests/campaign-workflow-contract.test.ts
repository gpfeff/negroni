import assert from "node:assert/strict";
import test from "node:test";
import {
  CAMPAIGN_PHASES,
  getCampaignPhase,
  getPhaseScreenState,
} from "@/lib/campaign-workflow";

test("the five phases keep a complete, ordered handoff contract", () => {
  assert.deepEqual(CAMPAIGN_PHASES.map((phase) => phase.id), ["research", "create", "launch", "iterate", "loop"]);
  assert.deepEqual(CAMPAIGN_PHASES.map((phase) => phase.number), ["01", "02", "03", "04", "05"]);

  for (const phase of CAMPAIGN_PHASES) {
    assert.ok(phase.primary_job.length > 0);
    assert.ok(phase.primary_action.label.length > 0);
    assert.ok(phase.outputs.length > 0);
    assert.ok(phase.outputs.every((output) => output.artifact.length > 0));
    assert.ok(phase.safety_boundary.length > 0);
  }

  const outputsByPhase = new Map(CAMPAIGN_PHASES.map((phase) => [
    phase.id,
    new Set(phase.outputs.map(({ artifact }) => artifact)),
  ]));
  for (const phase of CAMPAIGN_PHASES) {
    for (const input of phase.inputs) {
      assert.ok(
        outputsByPhase.get(input.source_phase)?.has(input.artifact),
        `${phase.id} requires ${input.artifact}, but ${input.source_phase} does not declare it as an output`,
      );
    }
  }
});

test("downstream phases remain blocked until their durable predecessor artifact exists", () => {
  const launch = getCampaignPhase("launch");
  const iterate = getCampaignPhase("iterate");
  const loop = getCampaignPhase("loop");

  assert.deepEqual(launch.inputs.map((input) => input.artifact), ["creative-manifest.json", "launch-copy.json"]);
  assert.deepEqual(iterate.inputs.map((input) => input.artifact), ["launch-receipt.json", "creative-manifest.json"]);
  assert.deepEqual(loop.inputs.map((input) => input.artifact), ["learning-ledger.jsonl", "experiment-result.json"]);

  assert.deepEqual(getPhaseScreenState("launch", {
    available: true,
    verified_artifacts: [],
    blocker: null,
  }), {
    status: "needs_input",
    title: "Launch needs 2 verified handoffs",
    detail: "Missing creative-manifest.json and launch-copy.json.",
    action: { label: "Open Create", target: "create" },
  });
  assert.deepEqual(getPhaseScreenState("launch", {
    available: true,
    verified_artifacts: ["creative-manifest.json", "launch-copy.json"],
    blocker: null,
  }), {
    status: "ready_for_review",
    title: "Launch handoff is ready for review",
    detail: "Every required artifact is verified. External action remains separately approval-gated.",
    action: { label: "Review handoff", target: "launch" },
  });
  assert.deepEqual(getPhaseScreenState("launch"), {
    status: "blocked",
    title: "Launch setup is not connected",
    detail: "This build cannot yet verify a saved Creative handoff or prepare a launch plan. Durable workflow handoff verification is not connected in this build.",
    action: { label: "Open Create", target: "create" },
  });
  assert.equal(launch.approval_required_for_external_action, true);
});
