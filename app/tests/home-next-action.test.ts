import assert from "node:assert/strict";
import test from "node:test";
import { deriveHomeNextAction } from "@/lib/intelligence/next-action";

const ready = { available: true, status: "ready" as const, blocker: null };
const blocked = { available: false, status: "blocked" as const, blocker: "Secure Research runner is not configured." };

test("Home next action follows the honest state priority without fabricating readiness", () => {
  assert.deepEqual(deriveHomeNextAction({ checking: true, capability: blocked, hasProfile: false, resultStatus: null }), {
    tone: "checking",
    eyebrow: "Research status",
    title: "Checking Research access...",
    description: "Negroni is verifying the current Research capability before offering an action.",
    action: null,
  });
  assert.equal(deriveHomeNextAction({ checking: false, capability: blocked, hasProfile: false, resultStatus: null }).title, "Finish Research setup");
  assert.equal(deriveHomeNextAction({ checking: false, capability: blocked, hasProfile: false, resultStatus: null }).action?.destination, "integrations");
  const firstResearchAction = deriveHomeNextAction({ checking: false, capability: ready, hasProfile: false, resultStatus: null });
  assert.equal(firstResearchAction.title, "Start Research");
  assert.equal(firstResearchAction.description, "Create the permanent brand file, add its current offer, and then build the evidence-backed research package.");
  assert.equal(deriveHomeNextAction({ checking: false, capability: ready, hasProfile: true, resultStatus: null }).title, "Run Research");
  assert.equal(deriveHomeNextAction({ checking: false, capability: ready, hasProfile: true, resultStatus: "partial" }).title, "Review limitations");
  assert.equal(deriveHomeNextAction({ checking: false, capability: ready, hasProfile: true, resultStatus: "complete" }).title, "Review & Approve");
});

test("Home exposes at most one action and never claims Create readiness", () => {
  const states = [
    deriveHomeNextAction({ checking: true, capability: blocked, hasProfile: false, resultStatus: null }),
    deriveHomeNextAction({ checking: false, capability: blocked, hasProfile: false, resultStatus: null }),
    deriveHomeNextAction({ checking: false, capability: ready, hasProfile: false, resultStatus: null }),
    deriveHomeNextAction({ checking: false, capability: ready, hasProfile: true, resultStatus: null }),
    deriveHomeNextAction({ checking: false, capability: ready, hasProfile: true, resultStatus: "partial" }),
    deriveHomeNextAction({ checking: false, capability: ready, hasProfile: true, resultStatus: "complete" }),
  ];
  assert.equal(states.every((state) => !/ready for create/i.test(JSON.stringify(state))), true);
  assert.equal(states.every((state) => state.action === null || typeof state.action.label === "string"), true);
});
