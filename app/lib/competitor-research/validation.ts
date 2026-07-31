import { homedir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  COMPETITOR_RESEARCH_CONTRACT_VERSION,
  LIFECYCLE_STATES,
  PROVIDER_NAMES,
  PUBLIC_EVIDENCE_CLAIMS_BOUNDARY,
  type CollectionState,
  type NormalizedAd,
  type Unknownable,
} from "./contracts.ts";

const SHA256_RE = /^[a-f0-9]{64}$/;
const ID_RE = /^[a-z][a-z0-9_-]{2,127}$/;
const TRACKING_PARAMETERS = new Set(["fbclid", "gclid", "dclid", "msclkid"]);
const PROHIBITED_PUBLIC_CLAIMS = /\b(?:profitable|profitability|positive\s+roas|roas-positive|verified\s+winner|converts?|conversions?|cpa|revenue)\b/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isNonnegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function pathInside(path: string, parent: string): boolean {
  const difference = relative(parent, path);
  return difference === "" || (!difference.startsWith(`..${sep}`) && difference !== ".." && !isAbsolute(difference));
}

function validateUnknownable(value: unknown, label: string, validator: (candidate: unknown) => boolean): void {
  if (!isRecord(value) || !("value" in value) || !("reason" in value)) {
    throw new Error(`${label} must use the null-plus-reason contract.`);
  }
  if (value.value === null) {
    if (typeof value.reason !== "string" || !value.reason.trim()) {
      throw new Error(`${label} is missing an unknown reason.`);
    }
  } else {
    if (!validator(value.value)) throw new Error(`${label} contains an invalid known value.`);
    if (value.reason !== null) throw new Error(`${label} cannot include an unknown reason when a value is known.`);
  }
}

export function canonicalEvidenceUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Evidence URLs must be valid HTTPS URLs.");
  }
  if (url.protocol !== "https:") throw new Error("Evidence URLs must use HTTPS.");
  url.username = "";
  url.password = "";
  url.hash = "";
  const retained = [...url.searchParams.entries()]
    .filter(([key]) => !key.toLowerCase().startsWith("utm_") && !TRACKING_PARAMETERS.has(key.toLowerCase()))
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
  url.search = "";
  for (const [key, value] of retained) url.searchParams.append(key, value);
  return url.toString();
}

export function canAdvanceLifecycle(scan: {
  status: CollectionState;
  exact_advertiser: boolean;
  pagination_complete: boolean;
  coverage_complete: boolean;
}): boolean {
  return scan.status === "complete"
    && scan.exact_advertiser
    && scan.pagination_complete
    && scan.coverage_complete;
}

export function assertPublicEvidenceClaims(text: string): void {
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (!PROHIBITED_PUBLIC_CLAIMS.test(sentence)) continue;
    const explicitlyNegated = /\b(?:does\s+not|do\s+not|cannot|is\s+not|are\s+not|never)\b/i.test(sentence)
      && /\bprove\b/i.test(sentence);
    if (!explicitlyNegated) {
      throw new Error("Public competitor evidence contains a prohibited performance claim.");
    }
  }
}

export function validateNormalizedAd(value: unknown): NormalizedAd {
  if (!isRecord(value)
    || value.contract !== "negroni-normalized-ad"
    || value.contract_version !== COMPETITOR_RESEARCH_CONTRACT_VERSION
    || typeof value.project_id !== "string"
    || !ID_RE.test(value.ad_record_id as string)
    || typeof value.platform !== "string"
    || !PROVIDER_NAMES.includes(value.provider as never)
    || !["platform_public_ad_id", "stable_source_locator", "content_locator"].includes(value.identity_basis as string)
    || !["high", "medium", "low"].includes(value.identity_confidence as string)
    || typeof value.advertiser_id !== "string"
    || typeof value.advertiser_name !== "string"
    || !ID_RE.test(value.competitor_id as string)
    || !isTimestamp(value.first_observed_at)
    || !isTimestamp(value.last_observed_at)
    || !LIFECYCLE_STATES.includes(value.lifecycle_status as never)
    || !isNonnegativeInteger(value.successful_observations)
    || !isNonnegativeInteger(value.missed_eligible_observations)
    || !isNonnegativeInteger(value.days_observed_active)
    || !isNonnegativeInteger(value.observed_span_days)
    || typeof value.content_version_id !== "string"
    || ![...new Set(["created", "running", "complete", "complete_zero", "partial", "suspect", "blocked", "skipped", "failed", "unsupported"])].includes(value.collection_status as string)
    || !["high", "medium", "low", "unknown"].includes(value.evidence_confidence as string)
    || !Array.isArray(value.limitations)
    || value.limitations.some((item) => typeof item !== "string" || !item.trim())
    || typeof value.source_payload_sha256 !== "string"
    || !SHA256_RE.test(value.source_payload_sha256)) {
    throw new Error("The normalized competitor-ad contract is invalid.");
  }
  canonicalEvidenceUrl(String(value.source_url));
  if (value.public_ad_id !== null && (typeof value.public_ad_id !== "string" || !value.public_ad_id.trim())) {
    throw new Error("A public ad ID must be a non-empty string or null.");
  }
  if (value.identity_confidence === "low") {
    if (typeof value.identity_reason !== "string" || !value.identity_reason.trim()) {
      throw new Error("Low-confidence identities require an explicit identity reason.");
    }
  } else if (value.identity_reason !== null) {
    throw new Error("Stable identities cannot include a low-confidence identity reason.");
  }
  validateUnknownable(value.copy, "Ad copy", (candidate) => typeof candidate === "string");
  validateUnknownable(value.headline, "Ad headline", (candidate) => typeof candidate === "string");
  validateUnknownable(value.cta, "Ad CTA", (candidate) => typeof candidate === "string");
  validateUnknownable(value.creative_format, "Creative format", (candidate) => typeof candidate === "string" && Boolean(candidate.trim()));
  validateUnknownable(value.landing_page_url, "Landing-page URL", (candidate) => {
    if (typeof candidate !== "string") return false;
    try {
      canonicalEvidenceUrl(candidate);
      return true;
    } catch {
      return false;
    }
  });
  for (const limitation of value.limitations as string[]) assertPublicEvidenceClaims(limitation);
  return value as unknown as NormalizedAd;
}

export function validateRootRouting(input: {
  repository_root: string;
  artifact_root: string;
  runtime_root: string;
  allow_test_roots?: boolean;
}) {
  const repository = resolve(input.repository_root);
  const artifacts = resolve(input.artifact_root);
  const runtime = resolve(input.runtime_root);
  if (new Set([repository, artifacts, runtime]).size !== 3) {
    throw new Error("Repository, artifact, and runtime roots must be distinct.");
  }
  if (pathInside(artifacts, repository)) throw new Error("The artifact root cannot be inside the repository.");
  if (pathInside(runtime, repository)) throw new Error("The private runtime root cannot be inside the repository.");
  if (`${runtime}${sep}`.includes(`${sep}Documents${sep}`)) {
    throw new Error("The private runtime root cannot be inside Documents.");
  }
  if (pathInside(runtime, artifacts) || pathInside(artifacts, runtime)) {
    throw new Error("Artifact and private runtime roots cannot overlap.");
  }
  if (!input.allow_test_roots) {
    const expectedRuntime = resolve(homedir(), ".local/share/negroni");
    const expectedArtifacts = resolve(homedir(), "Documents/tools-negroni");
    if (!pathInside(runtime, expectedRuntime)) throw new Error("The runtime root must remain under ~/.local/share/negroni.");
    if (!pathInside(artifacts, expectedArtifacts)) throw new Error("The artifact root must remain under ~/Documents/tools-negroni.");
  }
  return { repository_root: repository, artifact_root: artifacts, runtime_root: runtime };
}

export function unknownValue<T>(reason: string): Unknownable<T> {
  if (!reason.trim()) throw new Error("Unknown values require a reason.");
  return { value: null, reason };
}

export function knownValue<T>(value: T): Unknownable<T> {
  return { value, reason: null };
}

export { PUBLIC_EVIDENCE_CLAIMS_BOUNDARY };
