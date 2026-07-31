import type {
  ApprovalState,
  DraperProposal,
  EvidenceReceipt,
  LearningRecord,
  LearningScope,
  LearningState,
  RetrievalReceipt,
  WarehouseMeasurement,
} from "./contracts.ts";
import type { VectorRepository } from "./vector-index.ts";

export interface LearningCoreStorage extends VectorRepository {
  readonly vaultRoot: string;
  now(): string;
  getBrand(scope: LearningScope): { id: string; name: string; description: string } | null;
  listAds(scope: LearningScope, query?: string | null): Array<{
    id: string;
    name: string;
    headline: string;
    primary_text: string;
    status: string;
  }>;
  listOutcomes(scope: LearningScope): WarehouseMeasurement[];
  getLearning(scope: LearningScope, learningId: string): LearningRecord | null;
  getLearningVersion(scope: LearningScope, learningId: string, version: number): LearningRecord | null;
  listEvidence(scope: LearningScope): EvidenceReceipt[];
  searchLearnings(scope: LearningScope, query: string, tokenBudget: number): RetrievalReceipt;
  createProposal(scope: LearningScope, input: {
    kind: DraperProposal["kind"];
    summary: string;
    diff: DraperProposal["diff"];
  }): { id: string; hash: string; status: DraperProposal["status"] };
  recordDecision(scope: LearningScope, input: {
    proposal_id: string;
    proposal_hash: string;
    decision: "approved" | "rejected";
    approved_by: string;
    rationale: string;
    decided_at: string;
  }): {
    decision_id: string;
    proposal_id: string;
    decision: "approved" | "rejected";
    decided_at: string;
  };
  transitionLearning(input: {
    scope: LearningScope;
    learning_id: string;
    to_state: LearningState;
    approval_state: ApprovalState;
    change_reason: string;
    statement?: string;
    confidence?: number;
    applicability?: string;
    limitations?: string[];
    supporting_evidence_ids?: string[];
    counterevidence_ids?: string[];
    replacement_learning_id?: string;
  }): LearningRecord;
  getVaultProjection(scope: LearningScope, learningId: string): {
    version: number;
    relative_path: string;
    sha256: string;
    generated_at: string;
  } | null;
  recordVaultProjection(input: LearningScope & {
    learning_id: string;
    version: number;
    relative_path: string;
    sha256: string;
    generated_at: string;
  }): void;
  recordHumanRevision(input: LearningScope & {
    import_id: string;
    learning_id: string;
    base_version: number;
    proposed_statement: string;
    note_sha256: string;
  }): { import_id: string; status: "pending_review" };
}
