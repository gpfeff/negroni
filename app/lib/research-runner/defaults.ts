import { createHash } from "node:crypto";
import { runCompetitorResearchCli } from "../competitor-research/runtime.ts";
import type { CompetitorMonitoringReceipt } from "../intelligence/contracts.ts";
import { projectProfileId } from "../meta-ads/profile.ts";
import type {
  CompetitorAdsIntelligence,
  ProviderNeutralCollectionReceipt,
} from "../meta-ads/contracts.ts";
import type {
  CompetitorBoundaryResult,
  ResearchRunnerDependencies,
} from "./contracts.ts";

const OFFICIAL_BLOCKER = "Official competitor collection is blocked until owner authorization and required commercial-ad coverage pass a bounded proof.";

function blockedCompetitorResult(projectId: string): CompetitorBoundaryResult {
  const collection: ProviderNeutralCollectionReceipt = {
    contract: "negroni-competitor-collection-receipt",
    contract_version: "1.0",
    project_id: projectId,
    run_id: `blocked_${projectId}`,
    provider: "official_meta_api",
    status: "blocked",
    resume_run_id: null,
    google_action: "not_requested",
    scheduler_action: "none",
    external_actions: [],
    limitations: [OFFICIAL_BLOCKER],
  };
  const intelligence: CompetitorAdsIntelligence = {
    engine: "meta-ads-intelligence",
    profile: projectProfileId(projectId),
    refresh_status: "blocked",
    last_successful_refresh_at: null,
    watched_competitors: 0,
    active_ads: 0,
    new_ads_today: 0,
    changed_ads: 0,
    creative_families: 0,
    possibly_no_longer_active: 0,
    reactivated_ads: 0,
    landing_page_changes: 0,
    coverage_limitations: [OFFICIAL_BLOCKER],
    claims_boundary: "Unavailable public evidence and visible signals do not prove spend, targeting, conversions, CPA, ROAS, revenue, or profitability.",
    collection_receipt: collection,
    links: {
      database: null,
      report_markdown: null,
      report_csv: null,
      google_sheet: null,
    },
  };
  const monitoring: CompetitorMonitoringReceipt = {
    engine: "meta-ads-intelligence",
    cadence: "nightly",
    local_time: "02:17",
    timezone: "America/Los_Angeles",
    status: "blocked",
    schedule_id: null,
    watch_count: 0,
    last_run_at: null,
    next_run_at: null,
    blocker: OFFICIAL_BLOCKER,
  };
  return { collection, intelligence, monitoring };
}

export function createDefaultResearchRunnerDependencies(): ResearchRunnerDependencies {
  return {
    capabilities: {
      prompt_source: "blocked",
      research_engine: "blocked",
      google_drive: "blocked",
      competitor_collection: "blocked",
      scheduler: "inactive",
    },
    prompt_source: {
      async fetchApprovedSource() {
        throw new Error("No owner-scoped prompt-source provider is configured.");
      },
    },
    research_engine: {
      async executePrompt() {
        throw new Error("No owner-scoped research provider is configured.");
      },
    },
    competitor_boundary: {
      async run({ project_id, deadline_seconds }) {
        // The dry-run call is deliberate: every runner integration exercises the
        // same stable CLI boundary, while the result remains blocked until a
        // configured provider has passed its separate authorization proof.
        await runCompetitorResearchCli([
          "--project", project_id,
          "--mode", "nightly",
          "--deadline-seconds", String(deadline_seconds),
          "--json",
          "--dry-run",
        ]);
        return blockedCompetitorResult(project_id);
      },
    },
    google_filing: {
      async fileResearch(input) {
        return {
          status: "blocked",
          kind: "not_configured",
          google_doc: null,
          google_sheet: null,
          markdown_sha256: createHash("sha256").update(input.markdown).digest("hex"),
          document_readback_sha256: null,
          sole_parent_verified: false,
          private_access_verified: false,
          blocker: "Verified owner-scoped Google OAuth with drive.file is not configured.",
          external_actions: [],
        };
      },
    },
  };
}
