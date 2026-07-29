import type { LaneRecord, LaneState, ProjectState } from "./types";

const PROJECT_TRANSITIONS: Record<ProjectState, ProjectState[]> = {
  draft: ["ready"],
  ready: ["draft", "researching"],
  researching: ["needs_review", "partial", "complete", "failed"],
  needs_review: ["draft", "ready", "researching", "partial", "complete", "failed"],
  partial: ["draft", "ready", "researching", "needs_review", "complete", "failed"],
  complete: ["draft", "ready", "researching", "needs_review"],
  failed: ["researching", "draft", "ready"],
};

const LANE_TRANSITIONS: Record<LaneState, LaneState[]> = {
  not_started: ["ready", "researching", "blocked"],
  ready: ["researching", "blocked"],
  researching: ["needs_review", "partial", "complete", "failed", "blocked"],
  needs_review: ["researching", "partial", "complete", "failed"],
  partial: ["researching", "needs_review", "complete", "failed", "blocked"],
  complete: ["researching", "needs_review"],
  failed: ["ready", "researching", "blocked"],
  blocked: ["ready", "researching", "not_started"],
};

export function canTransitionProject(
  current: ProjectState,
  next: ProjectState,
): boolean {
  return current === next || PROJECT_TRANSITIONS[current].includes(next);
}

export function transitionProject(
  current: ProjectState,
  next: ProjectState,
): ProjectState {
  if (!canTransitionProject(current, next)) {
    throw new Error(`Illegal project transition: ${current} -> ${next}`);
  }
  return next;
}

export function transitionLane(
  lane: LaneRecord,
  next: LaneState,
  update: Partial<Omit<LaneRecord, "id" | "title" | "state">> = {},
): LaneRecord {
  if (lane.state !== next && !LANE_TRANSITIONS[lane.state].includes(next)) {
    throw new Error(`Illegal lane transition: ${lane.state} -> ${next}`);
  }
  return { ...lane, ...update, state: next };
}

export function deriveProjectState(lanes: LaneRecord[]): ProjectState {
  if (lanes.length === 0) return "draft";
  if (lanes.some((lane) => lane.state === "researching")) return "researching";
  if (lanes.some((lane) => lane.state === "failed")) return "failed";
  if (lanes.some((lane) => lane.state === "needs_review")) return "needs_review";
  if (lanes.every((lane) => lane.state === "complete")) return "complete";
  if (
    lanes.some((lane) => lane.state === "partial") ||
    lanes.some((lane) => lane.state === "blocked")
  ) {
    return "partial";
  }
  return "ready";
}
