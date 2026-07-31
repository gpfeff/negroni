import type { RunCapability, RunResult } from "./contracts.ts";

export type HomeNextAction = {
  tone: "checking" | "blocked" | "ready" | "partial" | "approval";
  eyebrow: string;
  title: string;
  description: string;
  action: null | {
    label: string;
    destination: "settings" | "research" | "run" | "status" | "review";
  };
};

export function deriveHomeNextAction(input: {
  checking: boolean;
  capability: RunCapability;
  hasProfile: boolean;
  resultStatus: RunResult["status"] | null;
}): HomeNextAction {
  if (input.checking) {
    return {
      tone: "checking",
      eyebrow: "Research status",
      title: "Checking Research access...",
      description: "Negroni is verifying the current Research capability before offering an action.",
      action: null,
    };
  }
  if (!input.capability.available || input.capability.status === "blocked") {
    return {
      tone: "blocked",
      eyebrow: "Research blocked",
      title: "Finish Research setup",
      description: input.capability.blocker ?? "Research access is unavailable until its configured prerequisite is verified.",
      action: { label: "Open Settings", destination: "settings" },
    };
  }
  if (!input.hasProfile) {
    return {
      tone: "ready",
      eyebrow: "Research ready",
      title: "Start Research",
      description: "Create a research set with the four campaign inputs, then build its evidence-backed draft.",
      action: { label: "Start Research", destination: "research" },
    };
  }
  if (input.resultStatus === null) {
    return {
      tone: "ready",
      eyebrow: "Research set selected",
      title: "Run Research",
      description: "Run the selected research set through the existing governed Research workflow.",
      action: { label: "Run Research", destination: "run" },
    };
  }
  if (input.resultStatus === "partial") {
    return {
      tone: "partial",
      eyebrow: "Review required",
      title: "Review limitations",
      description: "Usable evidence exists, but the recorded limitations must remain visible before approval.",
      action: { label: "Review limitations", destination: "status" },
    };
  }
  return {
    tone: "approval",
    eyebrow: "Approval required",
    title: "Review & Approve",
    description: "Review the exact Research revision and approve its immutable handoff only when the evidence is sufficient.",
    action: { label: "Review & Approve", destination: "review" },
  };
}
