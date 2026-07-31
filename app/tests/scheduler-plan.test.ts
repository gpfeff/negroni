import assert from "node:assert/strict";
import test from "node:test";
import { buildDryRunSchedulePlan } from "@/lib/competitor-research/scheduler-plan";

test("the dry-run schedule has one deterministic owner and the stable command only", () => {
  const first = buildDryRunSchedulePlan({
    project_id: "fixture-clean",
    timezone: "America/Los_Angeles",
    now: "2026-07-30T17:00:00.000Z",
  });
  const second = buildDryRunSchedulePlan({
    project_id: "fixture-clean",
    timezone: "America/Los_Angeles",
    now: "2026-07-30T17:00:00.000Z",
  });
  assert.deepEqual(second, first);
  assert.match(first.owner_id, /^negroni-competitor-/);
  assert.equal(first.activation_state, "not_installed");
  assert.deepEqual(first.command, [
    "negroni",
    "research",
    "competitors",
    "run",
    "--project",
    "fixture-clean",
    "--mode",
    "nightly",
    "--deadline-seconds",
    "120",
    "--json",
  ]);
});

test("the schedule is bounded, overlap-safe, resumable, and exposes durable exit-state mapping", () => {
  const plan = buildDryRunSchedulePlan({
    project_id: "fixture-clean",
    timezone: "America/Los_Angeles",
    now: "2026-07-30T17:00:00.000Z",
  });
  assert.equal(plan.cron, "17 2 * * *");
  assert.equal(plan.next_run_at, "2026-07-31T09:17:00.000Z");
  assert.equal(plan.maximum_runtime_seconds, 120);
  assert.equal(plan.overlap_prevention, "stable_cli_profile_lock");
  assert.deepEqual(plan.exit_receipts, {
    "0": "success_or_complete_zero",
    "3": "partial_with_resume_receipt",
    "4": "blocked_or_skipped_receipt",
    "5": "failure_with_recovery_receipt",
    "64": "invalid_configuration_without_provider_work",
  });
  assert.match(plan.resume_command, /--resume-run <run-id>/);
  assert.match(plan.pause_and_rollback, /disable/i);
});

test("scheduler input and output reject or omit secrets, paths, watchlists, cookies, and business logic", () => {
  assert.throws(() => buildDryRunSchedulePlan({
    project_id: "fixture-clean",
    timezone: "Not/A-Timezone",
    now: "2026-07-30T17:00:00.000Z",
  }), /timezone/);
  const serialized = JSON.stringify(buildDryRunSchedulePlan({
    project_id: "fixture-clean",
    timezone: "America/Los_Angeles",
    now: "2026-07-30T17:00:00.000Z",
  })).toLowerCase();
  for (const forbidden of ["credential", "password", "access_token", "cookie", "watchlist", "/users/", "/tmp/", "artifact_root", "runtime_root"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});
