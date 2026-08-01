import { createHash } from "node:crypto";
import { runCompetitorResearchCli } from "../competitor-research/runtime.ts";
import {
  PROMPT_SOURCE_DOCUMENT_ID,
  RESEARCH_PROMPTS,
  type CompetitorMonitoringReceipt,
} from "../intelligence/contracts.ts";
import { projectProfileId } from "../meta-ads/profile.ts";
import type {
  CompetitorAdsIntelligence,
  ProviderNeutralCollectionReceipt,
} from "../meta-ads/contracts.ts";
import type {
  ApprovedPromptSource,
  CompetitorBoundaryResult,
  ResearchRunnerDependencies,
} from "./contracts.ts";
import { createGeminiDeepResearchEngine } from "./gemini-deep-research.ts";

const OFFICIAL_BLOCKER = "Official competitor collection is blocked until owner authorization and required commercial-ad coverage pass a bounded proof.";
const EMBEDDED_PROMPT_SOURCE: ApprovedPromptSource = {
  document_id: PROMPT_SOURCE_DOCUMENT_ID,
  modified_at: "2026-07-31T00:00:00.000Z",
  prompts: [
    {
      id: RESEARCH_PROMPTS[0],
      content: "Research the market awareness surrounding this brand and current offer. Use current public evidence to identify category language, sophistication, demand signals, common claims, objections, and the audience's likely awareness stage. Separate observed facts from inference, retain URL citations and access dates, state uncertainty, and finish with concrete opportunities for lead-generation messaging.",
    },
    {
      id: RESEARCH_PROMPTS[1],
      content: "Research the known competitors supplied in the intake plus evidence-backed adjacent competitors discovered from public sources. Compare their offers, positioning, proof, calls to action, visible creative themes, landing-page patterns, and gaps without copying protected assets or inferring private performance. Retain URL citations and access dates, label coverage limitations, and finish with original competitive opportunities.",
    },
    {
      id: RESEARCH_PROMPTS[2],
      content: "Build an evidence-led psychographic customer avatar for the offer using the brand, profession, job title, industry, location, website, known competitors, and optional target age supplied in the intake. Distinguish evidence from hypotheses while covering jobs to be done, pains, desired outcomes, anxieties, objections, decision criteria, language patterns, trust signals, and purchase context. Cite public sources and finish with testable opportunities.",
    },
    {
      id: RESEARCH_PROMPTS[3],
      content: "Synthesize the cited outputs from steps 1-3 into one Master Research document for this brand and offer. Reconcile conflicts, preserve citations and limitations, identify the strongest supported audience problems and offer opportunities, and distinguish facts, estimates, inference, hypotheses, and unknowns. The result must be usable by Negroni Creative as the current offer-scoped research package without erasing the permanent shared brand foundation.",
    },
    {
      id: RESEARCH_PROMPTS[4],
      content: "Use the completed Master Research output to create a Brand Tone of Voice guide for this permanent brand foundation and current offer. Define voice principles, vocabulary, phrasing, emotional register, proof discipline, prohibited claims, examples, and offer-specific adaptations. Preserve the Master Research evidence boundaries, avoid fabricated performance claims, and finish with practical creative opportunities.",
    },
  ],
};

function safeBrokerUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol === "https:"
      || (url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname))) {
      return url;
    }
  } catch {
    // Invalid broker configuration remains blocked below.
  }
  return null;
}

function blockedGoogleFiling(markdown: string, blocker: string) {
  return {
    status: "blocked" as const,
    kind: "not_configured" as const,
    google_doc: null,
    google_sheet: null,
    folder_name: null,
    folder_url: null,
    markdown_sha256: createHash("sha256").update(markdown).digest("hex"),
    document_readback_sha256: null,
    sole_parent_verified: false,
    private_access_verified: false,
    blocker,
    external_actions: [],
  };
}

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
  const brokerUrl = process.env.CREDENTIAL_BROKER_URL?.trim() ?? "";
  const brokerToken = process.env.CREDENTIAL_BROKER_TOKEN?.trim() ?? "";
  const brokerBase = safeBrokerUrl(brokerUrl);
  const brokerConfigured = Boolean(brokerBase && brokerToken.length >= 16);
  const geminiConfigured = brokerConfigured;
  const embeddedPromptSource = process.env.NEGRONI_PROMPT_SOURCE_MODE?.trim() === "embedded";
  return {
    capabilities: {
      prompt_source: embeddedPromptSource ? "configured" : "blocked",
      research_engine: geminiConfigured ? "configured" : "blocked",
      google_drive: brokerConfigured ? "configured" : "blocked",
      competitor_collection: "blocked",
      scheduler: "inactive",
    },
    prompt_source: {
      async fetchApprovedSource({ document_id }) {
        if (!embeddedPromptSource || document_id !== PROMPT_SOURCE_DOCUMENT_ID) {
          throw new Error("No owner-scoped prompt-source provider is configured.");
        }
        return structuredClone(EMBEDDED_PROMPT_SOURCE);
      },
    },
    research_engine: geminiConfigured
      ? createGeminiDeepResearchEngine({
        broker_url: brokerUrl,
        broker_token: brokerToken,
      })
      : {
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
        if (!brokerConfigured || !brokerBase) {
          return blockedGoogleFiling(input.markdown, "Verified owner-scoped Google OAuth with drive.file is not configured.");
        }
        try {
          const response = await fetch(new URL("/v1/providers/google-drive/file-research", brokerBase), {
            method: "POST",
            headers: {
              authorization: `Bearer ${brokerToken}`,
              "content-type": "application/json",
            },
            body: JSON.stringify(input),
            signal: AbortSignal.timeout(2 * 60 * 1000),
          });
          if (!response.ok) {
            return blockedGoogleFiling(input.markdown, "The verified Google Drive filing boundary rejected this run.");
          }
          return await response.json();
        } catch {
          return blockedGoogleFiling(input.markdown, "The verified Google Drive filing boundary could not be reached.");
        }
      },
    },
  };
}
