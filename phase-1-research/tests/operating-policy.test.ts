import assert from "node:assert/strict";
import test from "node:test";
import { operatingModeCopy, requiresApproval } from "@/lib/operating-policy";

test("safety mode gates commits while yolo mode can automate local work", () => {
  assert.equal(requiresApproval("safety", "git_commit"), true);
  assert.equal(requiresApproval("yolo", "git_commit"), false);
  assert.equal(requiresApproval("safety", "draft"), false);
});

test("no operating mode bypasses live campaign approval", () => {
  for (const action of ["ad_account_mutation", "budget_change", "launch_traffic", "publish_creative", "submit_form"] as const) {
    assert.equal(requiresApproval("safety", action), true);
    assert.equal(requiresApproval("yolo", action), true);
  }
  assert.match(operatingModeCopy("yolo"), /still require approval/);
});
