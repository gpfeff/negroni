import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type { MetaAdsProjectSnapshot, ProviderNeutralCollectionReceipt } from "./contracts.ts";
import { projectProfileId, runtimeHome } from "./profile.ts";
import { parseMetaAdsSnapshot } from "./validation.ts";

const execFileAsync = promisify(execFile);

type CommandResult = { exitCode: number; stdout: string; stderr: string };
export type MetaAdsCommandRunner = (argv: string[]) => Promise<CommandResult>;

export type DailyRefreshRequest = {
  project_id: string;
  collector: "normalized_import" | "official_meta_api";
  input_directory?: string;
  download_media?: boolean;
  publish_google?: boolean;
  watches?: Array<{
    watch_id: string;
    page_id: string;
  }>;
};

export type DailyRefreshReceipt = {
  profile: string;
  state: MetaAdsProjectSnapshot["refresh"]["status"];
  snapshot: MetaAdsProjectSnapshot;
  google_action: "not_requested" | "published" | "blocked";
  scheduler_action: "none";
  provider_receipt: ProviderNeutralCollectionReceipt;
};

function defaultCliPath(): string {
  return resolve(
    process.env.META_ADS_INTELLIGENCE_CLI?.trim()
      || resolve(process.cwd(), "../meta-ads-intelligence/meta_ads_intelligence.py"),
  );
}

export class MetaAdsCliAdapter {
  readonly cliPath: string;
  readonly pythonPath: string;
  readonly runtimeRoot: string;
  readonly runCommand: MetaAdsCommandRunner;

  constructor(options: {
    cliPath?: string;
    pythonPath?: string;
    runtimeRoot?: string;
    runCommand?: MetaAdsCommandRunner;
  } = {}) {
    this.cliPath = resolve(options.cliPath || defaultCliPath());
    this.pythonPath = options.pythonPath || process.env.META_ADS_INTELLIGENCE_PYTHON?.trim() || "python3";
    this.runtimeRoot = runtimeHome(options.runtimeRoot);
    this.runCommand = options.runCommand ?? (async (argv) => {
      try {
        const result = await execFileAsync(this.pythonPath, [this.cliPath, ...argv], {
          encoding: "utf8",
          timeout: 15 * 60 * 1000,
          maxBuffer: 10 * 1024 * 1024,
        });
        return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
      } catch (error) {
        const failed = error as Error & { code?: number; stdout?: string; stderr?: string };
        return {
          exitCode: typeof failed.code === "number" ? failed.code : 2,
          stdout: failed.stdout ?? "",
          stderr: failed.stderr ?? failed.message,
        };
      }
    });
  }

  private async invoke(
    profile: string,
    command: string[],
    allowedExitCodes: number[] = [0],
  ): Promise<unknown> {
    const result = await this.runCommand([
      "--runtime-home",
      this.runtimeRoot,
      "--profile",
      profile,
      "--json",
      ...command,
    ]);
    if (!allowedExitCodes.includes(result.exitCode)) {
      throw new Error(`Meta Ads Intelligence ${command[0]} failed with exit code ${result.exitCode}.`);
    }
    try {
      return JSON.parse(result.stdout);
    } catch {
      throw new Error(`Meta Ads Intelligence ${command[0]} returned invalid JSON.`);
    }
  }

  async ensureProjectProfile(
    projectId: string,
    requestedWatches: DailyRefreshRequest["watches"] = [],
  ): Promise<string> {
    const profile = projectProfileId(projectId);
    await this.invoke(profile, ["init"]);
    await this.invoke(profile, ["validate"]);
    const existing = await this.invoke(profile, ["watches"]) as Array<{
      id?: unknown;
      page_id?: unknown;
    }>;
    if (!Array.isArray(existing)) throw new Error("Meta Ads Intelligence returned an invalid watchlist.");
    for (const watch of requestedWatches) {
      const current = existing.find((item) => item.id === watch.watch_id);
      if (current) {
        if (current.page_id !== watch.page_id) {
          throw new Error("An existing Meta Ads Intelligence watch has a different Page ID.");
        }
        continue;
      }
      await this.invoke(profile, [
        "watch",
        "add",
        "--id",
        watch.watch_id,
        "--page-id",
        watch.page_id,
      ]);
    }
    return profile;
  }

  async dailyRefresh(request: DailyRefreshRequest): Promise<DailyRefreshReceipt> {
    const profile = await this.ensureProjectProfile(request.project_id, request.watches);
    if (request.collector === "normalized_import" && !request.input_directory) {
      throw new Error("Normalized import refreshes require an isolated input directory.");
    }
    const sourceArguments = request.collector === "official_meta_api"
      ? ["--official-api"]
      : ["--input-dir", resolve(request.input_directory!)];
    const nightly = await this.invoke(
      profile,
      [
        "nightly",
        ...sourceArguments,
        ...(request.download_media === false ? ["--no-download"] : []),
      ],
      [0, 3],
    ) as { nightly_run_id?: unknown };
    if (typeof nightly.nightly_run_id !== "string" || !nightly.nightly_run_id) {
      throw new Error("Meta Ads Intelligence did not return a nightly run receipt.");
    }
    await this.invoke(profile, ["families", "rebuild"]);
    await this.invoke(profile, ["report", "--hours", "48"]);
    let googleAction: DailyRefreshReceipt["google_action"] = "not_requested";
    if (request.publish_google) {
      const publish = await this.invoke(
        profile,
        ["publish", "--resume", "--apply"],
        [0, 3, 5],
      ) as { status?: unknown; failed?: unknown; verified_readback?: unknown };
      googleAction = publish.verified_readback === true && Number(publish.failed) === 0
        ? "published"
        : "blocked";
    }
    const rawSnapshot = await this.invoke(
      profile,
      ["snapshot", "--nightly-run-id", nightly.nightly_run_id],
    );
    const snapshot = parseMetaAdsSnapshot(rawSnapshot, profile);
    const limitations = [...snapshot.limitations];
    const providerReceipt: ProviderNeutralCollectionReceipt = {
      contract: "negroni-competitor-collection-receipt",
      contract_version: "1.0",
      project_id: request.project_id,
      run_id: nightly.nightly_run_id,
      provider: request.collector,
      status: snapshot.refresh.status === "never_run" ? "failed" : snapshot.refresh.status,
      resume_run_id: snapshot.refresh.status === "partial" ? nightly.nightly_run_id : null,
      google_action: googleAction,
      scheduler_action: "none",
      external_actions: googleAction === "published" ? ["google_publish"] : [],
      limitations,
    };
    return {
      profile,
      state: snapshot.refresh.status,
      snapshot,
      google_action: googleAction,
      scheduler_action: "none",
      provider_receipt: providerReceipt,
    };
  }
}
