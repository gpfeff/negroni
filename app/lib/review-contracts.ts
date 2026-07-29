export type ResearchSeedStatus = "draft" | "approved" | "draft_changes";
export type ResearchRevisionOrigin = "research_run" | "manual_edit" | "ai_proposal";
export type ResearchRevisionStatus = "accepted" | "proposed" | "rejected";

export type ResearchSeedWorkspace = {
  profile_id: string;
  status: ResearchSeedStatus;
  current_revision_id: string | null;
  approved_revision_id: string | null;
  approved_seed_sha256: string | null;
  latest_run_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ResearchRevision = {
  id: string;
  profile_id: string;
  revision_number: number;
  parent_revision_id: string | null;
  origin: ResearchRevisionOrigin;
  status: ResearchRevisionStatus;
  markdown_content: string;
  change_summary: string;
  created_at: string;
};

export type ResearchMessage = {
  id: string;
  profile_id: string;
  role: "user" | "assistant";
  body: string;
  status: "note" | "answered" | "pending" | "rejected" | "failed";
  proposed_revision_id: string | null;
  created_at: string;
};

export type ResearchReviewResponse = {
  available: boolean;
  ai_available: boolean;
  workspace: ResearchSeedWorkspace | null;
  revisions: ResearchRevision[];
  messages: ResearchMessage[];
  blocker: string | null;
};
