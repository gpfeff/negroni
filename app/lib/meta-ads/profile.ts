import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { resolve, sep } from "node:path";
import { validateProfileId } from "./profile-id.ts";

export { validateProfileId } from "./profile-id.ts";

export function projectProfileId(projectId: string): string {
  const normalized = projectId.normalize("NFKD").toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 38) || "project";
  const digest = createHash("sha256").update(projectId, "utf8").digest("hex").slice(0, 12);
  return `negroni-${normalized}-${digest}`;
}

export function runtimeHome(configured?: string): string {
  const root = resolve(configured?.trim() || process.env.META_ADS_INTELLIGENCE_RUNTIME_HOME?.trim()
    || resolve(homedir(), ".local/share/meta-ads-intelligence"));
  const documentsSegment = `${sep}Documents${sep}`;
  if (`${root}${sep}`.includes(documentsSegment)) {
    throw new Error("Meta Ads Intelligence runtime state must remain outside Documents.");
  }
  return root;
}

export function assertSnapshotProfile(expected: string, actual: string): void {
  if (validateProfileId(actual) !== validateProfileId(expected)) {
    throw new Error("Meta Ads Intelligence returned data from a different project profile.");
  }
}
