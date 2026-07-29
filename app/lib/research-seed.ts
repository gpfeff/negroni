import type { ResearchSeedStatus } from "@/lib/review-contracts";

export const RESEARCH_SEED_MINIMUM = 100;
export const RESEARCH_SEED_MAXIMUM = 500_000;

export function researchSeedLengthError(value: unknown): string | null {
  if (typeof value !== "string"
    || value.trim().length < RESEARCH_SEED_MINIMUM
    || value.length > RESEARCH_SEED_MAXIMUM) {
    return "The research seed must contain between 100 and 500,000 characters.";
  }
  return null;
}

export function nextResearchSeedStatus(approvedRevisionId: string | null): ResearchSeedStatus {
  return approvedRevisionId ? "draft_changes" : "draft";
}

export function proposalMatchesCurrent(parentRevisionId: string | null, currentRevisionId: string | null): boolean {
  return Boolean(parentRevisionId && currentRevisionId && parentRevisionId === currentRevisionId);
}

export function approvedSeedIsCurrent(approvedRevisionId: string | null, currentRevisionId: string | null): boolean {
  return Boolean(approvedRevisionId && approvedRevisionId === currentRevisionId);
}

export async function researchSeedSha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
