import type {
  CompetitorMonitoringReceipt,
  IntelligenceIntake,
  ResearchPromptId,
  RunResult,
} from "../intelligence/contracts.ts";
import type {
  CompetitorAdsIntelligence,
  ProviderNeutralCollectionReceipt,
  ResearchArtifactReceipts,
} from "../meta-ads/contracts.ts";

export type RunnerCapabilityState =
  | "configured"
  | "fake_verified"
  | "blocked"
  | "inactive";

export type ApprovedPromptSource = {
  document_id: string;
  modified_at: string;
  prompts: Array<{ id: ResearchPromptId; content: string }>;
};

export type PromptExecutionRequest = {
  owner_key: string;
  run_id: string;
  prompt_id: ResearchPromptId;
  prompt_text: string;
  trust: "untrusted";
  allowed_tools: [];
  fixed_rules: readonly string[];
  intake: Pick<
    IntelligenceIntake,
    | "client_customer_name"
    | "profession_job_title"
    | "company_name"
    | "website_or_public_profile_url"
    | "service_or_offer_purchased"
    | "competitor_used"
    | "offer_or_lead_type"
    | "industry"
    | "country_region"
    | "target_age_range"
  >;
  completed_prompt_ids: ResearchPromptId[];
};

export type ResearchSequenceRequest = Omit<
  PromptExecutionRequest,
  "prompt_id" | "prompt_text" | "completed_prompt_ids"
> & {
  prompts: Array<{ id: ResearchPromptId; content: string }>;
  completed_prompt_ids: ResearchPromptId[];
};

export type ResearchPromptOutput = {
  prompt_id: ResearchPromptId;
  status: "complete" | "limited";
  limitation: string | null;
  markdown: string;
  opportunities: string[];
  sources: Array<{
    id: string;
    url: string;
    title: string;
    accessed_at: string;
  }>;
};

export type CompetitorBoundaryResult = {
  collection: ProviderNeutralCollectionReceipt;
  intelligence: CompetitorAdsIntelligence;
  monitoring: CompetitorMonitoringReceipt;
};

export type GoogleFilingInput = {
  owner_key: string;
  run_id: string;
  document_title: string;
  sheet_title: string;
  markdown_filename: string;
  markdown: string;
  sources: ResearchPromptOutput["sources"];
  competitor_collection: ProviderNeutralCollectionReceipt;
};

export type GoogleFilingResult = {
  status: "verified" | "blocked";
  kind: "live" | "fake" | "not_configured";
  google_doc: RunResult["outputs"]["google_doc"] | null;
  google_sheet: RunResult["outputs"]["google_sheet"] | null;
  markdown_sha256: string;
  document_readback_sha256: string | null;
  sole_parent_verified: boolean;
  private_access_verified: boolean;
  blocker: string | null;
  external_actions: Array<"google_files_created">;
};

export type ResearchRunnerDependencies = {
  capabilities: {
    prompt_source: RunnerCapabilityState;
    research_engine: RunnerCapabilityState;
    google_drive: RunnerCapabilityState;
    competitor_collection: RunnerCapabilityState;
    scheduler: RunnerCapabilityState;
  };
  prompt_source: {
    fetchApprovedSource(input: {
      owner_key: string;
      document_id: string;
    }): Promise<ApprovedPromptSource>;
  };
  research_engine: {
    executePrompt?: (input: PromptExecutionRequest) => Promise<ResearchPromptOutput>;
    executeSequence?: (input: ResearchSequenceRequest) => Promise<ResearchPromptOutput[]>;
  };
  competitor_boundary: {
    run(input: {
      owner_key: string;
      project_id: string;
      deadline_seconds: number;
    }): Promise<CompetitorBoundaryResult>;
  };
  google_filing: {
    fileResearch(input: GoogleFilingInput): Promise<GoogleFilingResult>;
  };
};

export type RunnerArtifactReceipt = ResearchArtifactReceipts[keyof ResearchArtifactReceipts];

export type SecureRunnerReceipt = {
  contract: "negroni-secure-runner-receipt";
  contract_version: "1.0";
  run_id: string;
  status: "complete" | "partial" | "blocked" | "skipped" | "failed";
  attempt: number;
  created_at: string;
  completed_prompt_ids: ResearchPromptId[];
  prompt_source: { document_id: string; modified_at: string | null };
  google: {
    status: "verified" | "blocked" | "not_started";
    kind: GoogleFilingResult["kind"] | null;
    readback_verified: boolean;
    blocker: string | null;
  };
  competitor: {
    status: ProviderNeutralCollectionReceipt["status"] | "not_started";
    run_id: string | null;
    scheduler_action: "none";
  };
  artifact_receipts: RunnerArtifactReceipt[];
  external_actions: GoogleFilingResult["external_actions"];
  limitations: string[];
  receipt_sha256: string;
};

export type RunnerOutcome = {
  status: SecureRunnerReceipt["status"];
  run_id: string;
  result: (RunResult & { runner_receipt: SecureRunnerReceipt }) | null;
  runner_receipt: SecureRunnerReceipt;
  error: string | null;
};

export type RunnerCapabilityReceipt = {
  contract: "negroni-runner-capability";
  contract_version: "1.0";
  state: "locally_verified_not_deployed" | "blocked";
  owner_scoped: true;
  prompt_source_document_id: string;
  prompt_sequence: readonly ResearchPromptId[];
  capabilities: ResearchRunnerDependencies["capabilities"];
  credentials: "server_side_only";
  browser_paths_allowed: false;
  browser_tools_allowed: false;
  scheduler_activation_available: false;
};

export type ResearchRunner = {
  capability(): RunnerCapabilityReceipt;
  run(owner: string, intake: unknown): Promise<RunnerOutcome>;
};
