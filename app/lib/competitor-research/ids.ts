import { createHash } from "node:crypto";
import type { StableAdIdentity } from "./contracts.ts";

function digest(value: string): string {
  return createHash("sha256").update(value.normalize("NFKC"), "utf8").digest("hex");
}

export function stableNamespacedId(namespace: string, ...parts: string[]): {
  id: string;
  full_sha256: string;
  input: string;
} {
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(namespace)) {
    throw new Error("Stable ID namespaces must be lowercase and explicit.");
  }
  const input = [namespace, ...parts.map((part) => part.normalize("NFKC").trim())].join("\u001f");
  const full = digest(input);
  return { id: `${namespace}_${full.slice(0, 16)}`, full_sha256: full, input };
}

export function stableAdIdentity(input: {
  platform: string;
  provider: string;
  public_ad_id: string | null;
  stable_source_locator: string | null;
  content_locator: string | null;
}): StableAdIdentity {
  const platform = input.platform.normalize("NFKC").trim().toLowerCase();
  const provider = input.provider.normalize("NFKC").trim().toLowerCase();
  if (!platform || !provider) throw new Error("Ad identity requires a platform and provider.");

  let basis: StableAdIdentity["identity_basis"];
  let locator: string;
  let confidence: StableAdIdentity["identity_confidence"];
  let reason: string | null = null;
  let autoMerge = true;
  if (input.public_ad_id?.trim()) {
    basis = "platform_public_ad_id";
    locator = input.public_ad_id.trim();
    confidence = "high";
  } else if (input.stable_source_locator?.trim()) {
    basis = "stable_source_locator";
    locator = input.stable_source_locator.trim();
    confidence = "medium";
  } else if (input.content_locator?.trim()) {
    basis = "content_locator";
    locator = input.content_locator.trim();
    confidence = "low";
    autoMerge = false;
    reason = "No stable public or source ID was supplied; content-only observations are not auto-merged across runs.";
  } else {
    throw new Error("Ad identity requires a public ID, stable source locator, or content locator.");
  }

  const stable = stableNamespacedId("ad", platform, provider, basis, locator);
  return {
    ad_record_id: stable.id,
    identity_basis: basis,
    identity_confidence: confidence,
    low_confidence_reason: reason,
    auto_merge_allowed: autoMerge,
    full_identity_sha256: stable.full_sha256,
    identity_input: stable.input,
  };
}

export function stableAliasRecord(input: {
  prior_ad_record_id: string;
  stable_ad_record_id: string;
  approved_by: string;
  approved_at: string;
}) {
  if (input.prior_ad_record_id === input.stable_ad_record_id) {
    throw new Error("An alias must connect two different internal identities.");
  }
  if (!input.approved_by.trim() || !Number.isFinite(Date.parse(input.approved_at))) {
    throw new Error("Identity aliases require an explicit reviewer and timestamp.");
  }
  const stable = stableNamespacedId(
    "alias",
    input.prior_ad_record_id,
    input.stable_ad_record_id,
    input.approved_by,
    input.approved_at,
  );
  return {
    alias_id: stable.id,
    prior_ad_record_id: input.prior_ad_record_id,
    stable_ad_record_id: input.stable_ad_record_id,
    approved_by: input.approved_by,
    approved_at: new Date(input.approved_at).toISOString(),
    sha256: stable.full_sha256,
  };
}
