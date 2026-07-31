import { createHash } from "node:crypto";
import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  RESEARCH_ARTIFACT_FILENAMES,
  type MetaAdsProjectSnapshot,
  type ProviderNeutralCollectionReceipt,
  type ResearchArtifactBundle,
  type ResearchArtifactKey,
  type ResearchArtifactReceipts,
} from "./contracts";

function metaEvidenceId(libraryId: string): string {
  return `META-AD-${libraryId}`;
}
export function mapMetaEvidenceIntoArtifacts(
  existing: ResearchArtifactBundle,
  snapshot: MetaAdsProjectSnapshot,
  collectionReceipt?: ProviderNeutralCollectionReceipt,
): ResearchArtifactBundle {
  const evidence = snapshot.evidence.map((item) => ({
    id: metaEvidenceId(item.library_id),
    evidence_type: "competitor_ad_observation",
    source: "meta_ads_intelligence",
    advertiser_name: item.advertiser_name,
    library_id: item.library_id,
    url: item.ad_library_url,
    first_observed_at: item.first_observed_at,
    last_observed_at: item.last_observed_at,
    lifecycle_status: item.lifecycle_status,
    claim_scope: "Observed public ad evidence only; not performance evidence.",
  }));
  const evidenceIds = evidence.map((item) => item.id);
  const briefSection = [
    "## Competitor Ads Intelligence",
    "",
    `- Last successful refresh: ${snapshot.refresh.last_successful_refresh_at ?? "not yet available"}`,
    `- Watched competitors: ${snapshot.totals.watched_competitors}`,
    `- Active or reactivated ads observed: ${snapshot.totals.active_ads}`,
    `- New ads in the selected daily run: ${snapshot.delta.new_ads}`,
    `- Changed ads in the selected daily run: ${snapshot.delta.changed_ads}`,
    `- Creative families observed: ${snapshot.totals.creative_families}`,
    `- Coverage: ${snapshot.limitations.length ? snapshot.limitations.join(" ") : "No recorded limitations."}`,
    "",
    snapshot.claims_boundary,
    "",
    evidenceIds.length
      ? `Supporting competitor-ad evidence: ${evidenceIds.map((id) => `[${id}]`).join(", ")}.`
      : "No supporting Meta ad observation is available; competitor-ad conclusions remain hypotheses.",
  ].join("\n");
  const researchBrief = existing.research_brief.includes("## Competitor Ads Intelligence")
    ? existing.research_brief
    : `${existing.research_brief.trim()}\n\n${briefSection}\n`;
  return {
    research_brief: researchBrief,
    evidence_index: {
      ...existing.evidence_index,
      competitor_ads: {
        source: "meta_ads_intelligence",
        generated_at: snapshot.generated_at,
        profile: snapshot.profile,
        entries: evidence,
        limitations: snapshot.limitations,
      },
    },
    opportunity_map: {
      ...existing.opportunity_map,
      competitor_ads: {
        evidence_ids: evidenceIds,
        observations: {
          new_ads: snapshot.delta.new_ads,
          changed_ads: snapshot.delta.changed_ads,
          creative_families: snapshot.totals.creative_families,
          landing_page_changes: snapshot.delta.landing_page_changes,
        },
        hypotheses: evidenceIds.length
          ? []
          : ["Competitor message and creative-pattern opportunities require supporting ad observations."],
        limitations: snapshot.limitations,
      },
    },
    creative_brief: {
      ...existing.creative_brief,
      competitor_ads: {
        evidence_ids: evidenceIds,
        pattern_status: evidenceIds.length ? "evidence_available" : "hypothesis_only",
        copy_protected_assets: false,
        performance_inference_allowed: false,
        claims_boundary: snapshot.claims_boundary,
      },
    },
    research_receipt: {
      ...existing.research_receipt,
      competitor_ads: {
        engine: "meta-ads-intelligence",
        engine_contract: snapshot.contract_version,
        profile: snapshot.profile,
        refresh: snapshot.refresh,
        scheduler: snapshot.scheduler,
        google: snapshot.google,
        limitations: snapshot.limitations,
        evidence_count: evidence.length,
        ...(collectionReceipt ? { provider_neutral_receipt: collectionReceipt } : {}),
      },
    },
  };
}

function serializedArtifact(key: ResearchArtifactKey, bundle: ResearchArtifactBundle): string {
  if (key === "research_brief") return `${bundle.research_brief.trim()}\n`;
  return `${JSON.stringify(bundle[key], null, 2)}\n`;
}

export async function writeResearchArtifacts(
  outputDirectory: string,
  bundle: ResearchArtifactBundle,
): Promise<ResearchArtifactReceipts> {
  const root = resolve(outputDirectory);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const receipts = {} as ResearchArtifactReceipts;
  for (const key of Object.keys(RESEARCH_ARTIFACT_FILENAMES) as ResearchArtifactKey[]) {
    const filename = RESEARCH_ARTIFACT_FILENAMES[key];
    const content = serializedArtifact(key, bundle);
    const target = resolve(root, filename);
    if (!target.startsWith(`${root}/`)) throw new Error("Research artifact path escaped its output directory.");
    const temporary = `${target}.tmp`;
    await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, target);
    await chmod(target, 0o600);
    receipts[key] = {
      filename,
      sha256: createHash("sha256").update(content, "utf8").digest("hex"),
      verified: true,
    };
  }
  return receipts;
}
