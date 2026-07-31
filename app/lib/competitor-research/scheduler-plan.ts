import { createHash } from "node:crypto";

type DryRunScheduleInput = {
  project_id: string;
  timezone: string;
  now: string;
};

export type DryRunSchedulePlan = {
  contract: "negroni-competitor-schedule-plan";
  contract_version: "1.0";
  activation_state: "not_installed";
  owner_id: string;
  project_id: string;
  cron: "17 2 * * *";
  timezone: string;
  next_run_at: string;
  command: string[];
  maximum_runtime_seconds: 120;
  overlap_prevention: "stable_cli_profile_lock";
  idempotency: "stable_run_and_projection_receipts";
  exit_receipts: {
    "0": "success_or_complete_zero";
    "3": "partial_with_resume_receipt";
    "4": "blocked_or_skipped_receipt";
    "5": "failure_with_recovery_receipt";
    "64": "invalid_configuration_without_provider_work";
  };
  resume_command: string;
  network_exposure: "one_bounded_read_only_provider_attempt_per_eligible_run";
  budget_exposure: "zero_ad_spend";
  pause_and_rollback: string;
};

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function nextRun(now: string, timezone: string): string {
  const parsed = Date.parse(now);
  if (!Number.isFinite(parsed)) throw new Error("Schedule planning requires a valid current timestamp.");
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const firstMinute = Math.floor(parsed / 60_000) * 60_000 + 60_000;
  for (let offset = 0; offset < 72 * 60; offset += 1) {
    const candidate = new Date(firstMinute + offset * 60_000);
    const parts = Object.fromEntries(formatter.formatToParts(candidate).map((part) => [part.type, part.value]));
    if (parts.hour === "02" && parts.minute === "17") return candidate.toISOString();
  }
  throw new Error("The next daily run could not be resolved for this timezone.");
}

export function buildDryRunSchedulePlan(input: DryRunScheduleInput): DryRunSchedulePlan {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).sort().join(",") !== "now,project_id,timezone") {
    throw new Error("Schedule planning input contains unsupported fields.");
  }
  if (typeof input.project_id !== "string" || !/^[a-z][a-z0-9_-]{2,127}$/.test(input.project_id)) {
    throw new Error("Schedule planning requires a stable lowercase project ID.");
  }
  if (typeof input.timezone !== "string" || !validTimezone(input.timezone)) {
    throw new Error("Schedule planning requires a valid IANA timezone.");
  }
  const owner = createHash("sha256").update(`negroni-scheduler:${input.project_id}`).digest("hex").slice(0, 16);
  return {
    contract: "negroni-competitor-schedule-plan",
    contract_version: "1.0",
    activation_state: "not_installed",
    owner_id: `negroni-competitor-${owner}`,
    project_id: input.project_id,
    cron: "17 2 * * *",
    timezone: input.timezone,
    next_run_at: nextRun(input.now, input.timezone),
    command: [
      "negroni",
      "research",
      "competitors",
      "run",
      "--project",
      input.project_id,
      "--mode",
      "nightly",
      "--deadline-seconds",
      "120",
      "--json",
    ],
    maximum_runtime_seconds: 120,
    overlap_prevention: "stable_cli_profile_lock",
    idempotency: "stable_run_and_projection_receipts",
    exit_receipts: {
      "0": "success_or_complete_zero",
      "3": "partial_with_resume_receipt",
      "4": "blocked_or_skipped_receipt",
      "5": "failure_with_recovery_receipt",
      "64": "invalid_configuration_without_provider_work",
    },
    resume_command: `negroni research competitors run --project ${input.project_id} --mode nightly --resume-run <run-id> --deadline-seconds 120 --json`,
    network_exposure: "one_bounded_read_only_provider_attempt_per_eligible_run",
    budget_exposure: "zero_ad_spend",
    pause_and_rollback: "Disable the single owner before another eligible run; retain immutable receipts and resume manually from the last partial run if needed.",
  };
}
