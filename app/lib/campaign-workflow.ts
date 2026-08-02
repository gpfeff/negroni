export const CAMPAIGN_PHASE_IDS = ["research", "create", "launch", "iterate", "loop"] as const;

export type CampaignPhaseId = typeof CAMPAIGN_PHASE_IDS[number];
export type WorkflowStatus = "needs_input" | "ready_for_review" | "approval_required" | "approved" | "running" | "complete" | "blocked" | "partial" | "failed";
export type WorkflowNavigationTarget = CampaignPhaseId;

export type CampaignArtifact = {
  artifact: string;
  description: string;
};

export type CampaignInput = CampaignArtifact & {
  source_phase: CampaignPhaseId;
};

export type CampaignPhase = {
  id: CampaignPhaseId;
  number: "01" | "02" | "03" | "04" | "05";
  name: string;
  primary_job: string;
  primary_action: { label: string; target: WorkflowNavigationTarget };
  inputs: readonly CampaignInput[];
  outputs: readonly CampaignArtifact[];
  safety_boundary: string;
  approval_required_for_external_action: boolean;
};

export type PhaseScreenState = {
  status: Extract<WorkflowStatus, "blocked" | "needs_input" | "ready_for_review">;
  title: string;
  detail: string;
  action: { label: string; target: WorkflowNavigationTarget };
};

export type PhaseVerification = {
  available: boolean;
  verified_artifacts: readonly string[];
  blocker: string | null;
};

export const WORKFLOW_VERIFICATION_UNAVAILABLE: PhaseVerification = {
  available: false,
  verified_artifacts: [],
  blocker: "Durable workflow handoff verification is not connected in this build.",
};

export const CAMPAIGN_PHASES: readonly CampaignPhase[] = [
  {
    id: "research",
    number: "01",
    name: "Research",
    primary_job: "Turn a brand and offer into an approved evidence package.",
    primary_action: { label: "Open Research", target: "research" },
    inputs: [],
    outputs: [{ artifact: "creative-brief.json", description: "Approved Research handoff with evidence and an immutable fingerprint." }],
    safety_boundary: "Research preserves uncertainty and requires explicit approval before Creative consumes its handoff.",
    approval_required_for_external_action: true,
  },
  {
    id: "create",
    number: "02",
    name: "Create",
    primary_job: "Turn approved research into reviewable concepts, assets, and launch copy.",
    primary_action: { label: "Open Create", target: "create" },
    inputs: [{ artifact: "creative-brief.json", description: "Approved Research handoff and exact fingerprint.", source_phase: "research" }],
    outputs: [
      { artifact: "creative-manifest.json", description: "Approved assets, provenance, and format validation." },
      { artifact: "launch-copy.json", description: "Approved copy matched to each planned ad." },
    ],
    safety_boundary: "Creative does not publish, spend money, or authorize an ad-account change.",
    approval_required_for_external_action: true,
  },
  {
    id: "launch",
    number: "03",
    name: "Launch",
    primary_job: "Prepare an approved creative package for a safe, reviewable delivery plan.",
    primary_action: { label: "Open Create", target: "create" },
    inputs: [
      { artifact: "creative-manifest.json", description: "Approved assets, provenance, and format validation.", source_phase: "create" },
      { artifact: "launch-copy.json", description: "Approved copy matched to each planned ad.", source_phase: "create" },
    ],
    outputs: [
      { artifact: "launch-diff.md", description: "Human-readable proposed account changes and budget exposure." },
      { artifact: "launch-receipt.json", description: "Readback from the exact launch state or a preserved partial receipt." },
    ],
    safety_boundary: "Planning is not permission to publish, change a budget, or launch traffic. Those actions require approval for the exact diff.",
    approval_required_for_external_action: true,
  },
  {
    id: "iterate",
    number: "04",
    name: "Iterate",
    primary_job: "Turn measured campaign evidence into one controlled next experiment.",
    primary_action: { label: "Open Launch", target: "launch" },
    inputs: [
      { artifact: "launch-receipt.json", description: "Readback from the exact launch state or a preserved partial receipt.", source_phase: "launch" },
      { artifact: "creative-manifest.json", description: "The exact creative package under evaluation.", source_phase: "create" },
    ],
    outputs: [
      { artifact: "experiment-result.json", description: "Evidence, caveats, and a win, loss, or inconclusive decision." },
      { artifact: "learning-ledger.jsonl", description: "Append-only decisions, caveats, and supporting evidence." },
    ],
    safety_boundary: "Iteration does not call a result a win without the declared evidence window, attribution context, and guardrails.",
    approval_required_for_external_action: true,
  },
  {
    id: "loop",
    number: "05",
    name: "Loop",
    primary_job: "Carry verified learning into the safest, highest-value next action.",
    primary_action: { label: "Open Iterate", target: "iterate" },
    inputs: [
      { artifact: "learning-ledger.jsonl", description: "Append-only decisions, caveats, and supporting evidence.", source_phase: "iterate" },
      { artifact: "experiment-result.json", description: "The most recent controlled outcome or explicit inconclusive result.", source_phase: "iterate" },
    ],
    outputs: [{ artifact: "loop-state.json", description: "Current baseline, waiting conditions, proposal queue, and next action." }],
    safety_boundary: "Loop may observe, draft, validate, and recommend. Any account mutation remains approval-gated.",
    approval_required_for_external_action: true,
  },
] as const;

const PHASE_UNAVAILABLE_STATES: Record<Extract<CampaignPhaseId, "launch" | "iterate" | "loop">, PhaseScreenState> = {
  launch: {
    status: "blocked",
    title: "Launch setup is not connected",
    detail: "This build cannot yet verify a saved Creative handoff or prepare a launch plan.",
    action: { label: "Open Create", target: "create" },
  },
  iterate: {
    status: "blocked",
    title: "Iteration setup is not connected",
    detail: "This build cannot yet verify a Launch receipt or evaluate a measured experiment.",
    action: { label: "Open Launch", target: "launch" },
  },
  loop: {
    status: "blocked",
    title: "Loop setup is not connected",
    detail: "This build cannot yet verify experiment evidence or select the next loop action.",
    action: { label: "Open Iterate", target: "iterate" },
  },
};

export function getCampaignPhase(id: CampaignPhaseId): CampaignPhase {
  const phase = CAMPAIGN_PHASES.find((candidate) => candidate.id === id);
  if (!phase) throw new Error(`Unknown campaign phase: ${id}`);
  return phase;
}

export function getPhaseScreenState(
  id: Extract<CampaignPhaseId, "launch" | "iterate" | "loop">,
  verification: PhaseVerification = WORKFLOW_VERIFICATION_UNAVAILABLE,
): PhaseScreenState {
  const phase = getCampaignPhase(id);
  if (!verification.available) {
    const unavailable = PHASE_UNAVAILABLE_STATES[id];
    return verification.blocker
      ? { ...unavailable, detail: `${unavailable.detail} ${verification.blocker}` }
      : unavailable;
  }
  const verified = new Set(verification.verified_artifacts);
  const missing = phase.inputs.filter(({ artifact }) => !verified.has(artifact));
  if (missing.length) {
    return {
      status: "needs_input",
      title: `${phase.name} needs ${missing.length === 1 ? "one verified handoff" : `${missing.length} verified handoffs`}`,
      detail: `Missing ${missing.map(({ artifact }) => artifact).join(" and ")}.`,
      action: phase.primary_action,
    };
  }
  return {
    status: "ready_for_review",
    title: `${phase.name} handoff is ready for review`,
    detail: "Every required artifact is verified. External action remains separately approval-gated.",
    action: { label: "Review handoff", target: id },
  };
}
