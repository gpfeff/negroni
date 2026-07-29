import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  mapMetaEvidenceIntoArtifacts,
  writeResearchArtifacts,
} from "@/lib/meta-ads/artifacts";
import { MetaAdsCliAdapter } from "@/lib/meta-ads/cli-adapter";
import type {
  MetaAdsProjectSnapshot,
  ResearchArtifactBundle,
} from "@/lib/meta-ads/contracts";
import { projectProfileId, runtimeHome } from "@/lib/meta-ads/profile";
import {
  parseMetaAdsSnapshot,
  toCompetitorAdsIntelligence,
} from "@/lib/meta-ads/validation";

function snapshot(profile: string): MetaAdsProjectSnapshot {
  return {
    contract: "meta-ads-intelligence-project-snapshot",
    contract_version: "1.0",
    profile,
    generated_at: "2026-07-29T20:00:00Z",
    refresh: {
      nightly_run_id: "nightly-fixture",
      status: "skipped",
      started_at: "2026-07-29T19:59:00Z",
      completed_at: "2026-07-29T20:00:00Z",
      last_successful_refresh_at: null,
    },
    competitors: [{
      watch_id: "fixture-page",
      page_id: "9876543210",
      advertiser_name: "Fixture Advertiser",
      verified: true,
    }],
    discovery_watch_count: 1,
    totals: {
      watched_competitors: 1,
      active_ads: 1,
      creative_families: 1,
      lifecycle: { active: 1 },
    },
    delta: {
      new_ads: 1,
      changed_ads: 0,
      newly_observed_creative_families: 1,
      possibly_no_longer_active: 0,
      reactivated_ads: 0,
      landing_page_changes: 0,
      collection_gaps_or_failures: [{
        watch_id: "fixture-page",
        status: "skipped",
        coverage_complete: false,
        error: "",
      }],
    },
    scheduler: null,
    google: {
      status: "not_configured",
      message: "Google publishing not configured.",
    },
    reports: {
      database_locator: "meta-ads.sqlite3",
      markdown_locator: "exports/new-ads-fixture.md",
      csv_locator: "exports/new-ads-fixture.csv",
    },
    evidence: [{
      library_id: "1234567890",
      advertiser_name: "Fixture Advertiser",
      lifecycle_status: "active",
      first_observed_at: "2026-07-29T19:59:00Z",
      last_observed_at: "2026-07-29T20:00:00Z",
      ad_library_url: "https://www.facebook.com/ads/library/?id=1234567890",
    }],
    limitations: [
      "Keyword watches are discovery-only and do not affect lifecycle or longitudinal statistics.",
      "No scheduler owner is recorded for this profile.",
    ],
    claims_boundary: "Observed longevity and recurrence are evidence only; they do not prove spend, conversions, CTR, CPA, ROAS, or profitability.",
  };
}

test("project profile IDs are deterministic, isolated, and runtime state stays outside Documents", () => {
  const first = projectProfileId("project/first");
  const second = projectProfileId("project/second");
  assert.equal(first, projectProfileId("project/first"));
  assert.notEqual(first, second);
  assert.match(first, /^negroni-[a-z0-9-]+$/);
  assert.throws(
    () => runtimeHome("/home/fixture/Documents/private-runtime"),
    /outside Documents/,
  );
});

test("competitor evidence maps into every durable Research artifact without replacing existing work", async () => {
  const base: ResearchArtifactBundle = {
    research_brief: "# Existing client and customer research",
    evidence_index: { human_sources: [{ id: "SRC-1" }] },
    opportunity_map: { approved_opportunities: ["Existing angle"] },
    creative_brief: { approval_owner: "Human reviewer" },
    research_receipt: { research_engine: "canonical-skill" },
  };
  const profile = projectProfileId("fixture-project");
  const mapped = mapMetaEvidenceIntoArtifacts(base, snapshot(profile));
  assert.match(mapped.research_brief, /Competitor Ads Intelligence/);
  assert.deepEqual(mapped.evidence_index.human_sources, [{ id: "SRC-1" }]);
  assert.equal(mapped.creative_brief.approval_owner, "Human reviewer");
  for (const key of ["evidence_index", "opportunity_map", "creative_brief", "research_receipt"] as const) {
    assert.ok(mapped[key].competitor_ads);
  }

  const directory = await mkdtemp(join(tmpdir(), "negroni-artifacts-"));
  try {
    const receipts = await writeResearchArtifacts(directory, mapped);
    assert.deepEqual(Object.values(receipts).map((receipt) => receipt.filename), [
      "research-brief.md",
      "evidence-index.json",
      "opportunity-map.json",
      "creative-brief.json",
      "research-receipt.json",
    ]);
    assert.match(await readFile(join(directory, "evidence-index.json"), "utf8"), /META-AD-1234567890/);
    assert.ok(Object.values(receipts).every((receipt) => /^[a-f0-9]{64}$/.test(receipt.sha256)));
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("the server adapter records skipped collection honestly and never creates a scheduler or Google action by default", async () => {
  const projectId = "fixture-project";
  const profile = projectProfileId(projectId);
  const calls: string[][] = [];
  const runCommand = async (argv: string[]) => {
    calls.push(argv);
    const command = argv[argv.indexOf("--json") + 1];
    if (command === "nightly") {
      return {
        exitCode: 0,
        stdout: JSON.stringify({ nightly_run_id: "nightly-fixture", status: "skipped", watch_runs: [] }),
        stderr: "",
      };
    }
    if (command === "snapshot") {
      return { exitCode: 0, stdout: JSON.stringify(snapshot(profile)), stderr: "" };
    }
    if (command === "watches") {
      return { exitCode: 0, stdout: "[]", stderr: "" };
    }
    if (command === "watches") {
      return { exitCode: 0, stdout: "[]", stderr: "" };
    }
    return { exitCode: 0, stdout: JSON.stringify({ status: "ok" }), stderr: "" };
  };
  const adapter = new MetaAdsCliAdapter({
    cliPath: "/opt/meta-ads-intelligence.py",
    runtimeRoot: "/tmp/negroni-meta-ads-runtime",
    runCommand,
  });
  const receipt = await adapter.dailyRefresh({
    project_id: projectId,
    collector: "normalized_import",
    input_directory: "/tmp/negroni-fixture-inputs",
    download_media: false,
  });
  assert.equal(receipt.profile, profile);
  assert.equal(receipt.state, "skipped");
  assert.equal(receipt.google_action, "not_requested");
  assert.equal(receipt.scheduler_action, "none");
  assert.ok(calls.every((argv) => argv.includes(profile)));
  assert.ok(!calls.some((argv) => argv.includes("schedule")));
  assert.ok(!calls.some((argv) => argv.includes("publish")));
});

test("snapshot validation rejects cross-profile reads and browser-facing links reject local paths", () => {
  const expected = projectProfileId("expected");
  assert.throws(
    () => parseMetaAdsSnapshot(snapshot(projectProfileId("different")), expected),
    /different project profile/,
  );
  const parsed = parseMetaAdsSnapshot(snapshot(expected), expected);
  const summary = toCompetitorAdsIntelligence(parsed, {
    database: "https://runner.example.test/artifacts/database",
    report_markdown: "https://runner.example.test/artifacts/report.md",
    report_csv: "https://runner.example.test/artifacts/report.csv",
    google_sheet: null,
  });
  assert.equal(summary.links.google_sheet, null);
  assert.throws(
    () => toCompetitorAdsIntelligence(parsed, {
      database: "file:///tmp/meta-ads.sqlite3",
      report_markdown: null,
      report_csv: null,
      google_sheet: null,
    }),
    /HTTPS/,
  );
});
