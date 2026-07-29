export type OperatingMode = "safety" | "yolo";

export type ProposedAction =
  | "draft"
  | "local_file_write"
  | "git_commit"
  | "ad_account_mutation"
  | "budget_change"
  | "launch_traffic"
  | "publish_creative"
  | "submit_form";

const EXTERNAL_APPROVAL_ACTIONS = new Set<ProposedAction>([
  "ad_account_mutation",
  "budget_change",
  "launch_traffic",
  "publish_creative",
  "submit_form",
]);

export function requiresApproval(mode: OperatingMode, action: ProposedAction): boolean {
  if (EXTERNAL_APPROVAL_ACTIONS.has(action)) return true;
  return mode === "safety" && action === "git_commit";
}

export function operatingModeCopy(mode: OperatingMode): string {
  return mode === "safety"
    ? "Ask before every local commit. Live campaign actions always require approval."
    : "Allow local drafting and commits. Live campaign actions still require approval.";
}
