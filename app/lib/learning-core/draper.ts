import { assertNoSecretMaterial } from "../contracts/secrets-core.mjs";
import {
  DRAPER_INTENTS,
  assertExactObject,
  assertScope,
  assertStableId,
  assertText,
  assertTimestamp,
  assertTokenBudget,
  type DraperIntent,
  type DraperProposal,
  type DraperResponse,
  type LearningScope,
  type RetrievalReceipt,
} from "./contracts.ts";
import type { LearningCoreStorage } from "./storage.ts";

export type DraperQueryInput = {
  scope: LearningScope;
  intent: DraperIntent;
  question: string;
  query?: string;
  ad_ids?: string[];
  token_budget?: number;
};

export type DraperDecisionInput = {
  scope: LearningScope;
  proposal_id: string;
  proposal_hash: string;
  decision: "approved" | "rejected";
  approved_by: string;
  rationale: string;
  decided_at: string;
};

const PRIVATE_PATH = /(?:file:\/\/\/|(?:^|[\s"'=:(\[])(?:\/(?!\/)[A-Za-z0-9._~+-][^\s"'<>]*|[A-Za-z]:\\))/i;

function money(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

function boundedUnique(values: string[]): string[] {
  return [...new Set(values)].slice(0, 20);
}

export class DraperService {
  readonly #store: LearningCoreStorage;

  constructor(store: LearningCoreStorage) {
    this.#store = store;
  }

  query(input: DraperQueryInput): DraperResponse {
    assertExactObject(input, ["scope", "intent", "question", "query", "ad_ids", "token_budget"], ["scope", "intent", "question"]);
    assertNoSecretMaterial(input, "Draper input");
    if (PRIVATE_PATH.test(JSON.stringify(input))) throw new Error("Draper input contains a private local path.");
    const scope = assertScope(input.scope);
    if (!DRAPER_INTENTS.includes(input.intent)) throw new Error("intent is not a supported Draper operation.");
    assertText(input.question, "question", 1_000);
    const tokenBudget = assertTokenBudget(input.token_budget ?? 800);
    const adIds = input.ad_ids === undefined ? [] : (() => {
      if (!Array.isArray(input.ad_ids) || input.ad_ids.length > 10) {
        throw new Error("ad_ids must contain at most 10 stable IDs.");
      }
      return [...new Set(input.ad_ids.map((id) => assertStableId(id, "ad_id")))];
    })();
    const brand = this.#store.getBrand(scope);
    if (!brand) throw new Error("Brand was not found in the requested owner and workspace scope.");
    const ads = this.#store.listAds(scope, input.query ?? null);
    const outcomes = this.#store.listOutcomes(scope);
    const retrieval = this.#retrieval(scope, input.intent, input.query, tokenBudget);
    const learnings = retrieval.matches;
    const matchedEvidence = boundedUnique(learnings.flatMap((match) => {
      const learning = this.#store.getLearning(scope, match.learning_id);
      return [...(learning?.supporting_evidence ?? []), ...(learning?.counterevidence ?? [])]
        .map((item) => item.evidence_id);
    })).flatMap((id) => this.#store.listEvidence(scope).filter((item) => item.evidence_id === id));
    const evidence = matchedEvidence.length > 0 ? matchedEvidence : this.#store.listEvidence(scope).slice(0, 20);
    const freshnessAsOf = outcomes[0]?.freshness_as_of ?? retrieval.freshness_as_of;
    const fixtureOnly = outcomes.length > 0 && outcomes.every((outcome) => outcome.fixture_only);
    const limitations = boundedUnique([
      ...learnings.flatMap((learning) => learning.limitations),
      ...(fixtureOnly ? ["Simulated fixture measurements do not establish live campaign performance."] : []),
    ]);
    const proposals: DraperProposal[] = [];
    let answer: string;

    switch (input.intent) {
      case "inspect_brand":
        answer = `${brand.name} is in the scoped catalog with ${ads.length} ad${ads.length === 1 ? "" : "s"} and ${outcomes.length} normalized outcome record${outcomes.length === 1 ? "" : "s"}.`;
        break;
      case "search_ads":
        answer = ads.length === 0
          ? `No ads matched the validated search for ${brand.name}.`
          : `${ads.length} scoped ad${ads.length === 1 ? "" : "s"} matched: ${ads.map((ad) => `${ad.name} — ${ad.headline}`).join("; ")}.`;
        break;
      case "compare_creatives": {
        const requested = adIds;
        const selected = requested.length === 0 ? ads.slice(0, 2) : ads.filter((ad) => requested.includes(ad.id));
        answer = selected.length < 2
          ? "At least two scoped ads are required for a creative comparison."
          : `Creative comparison for ${brand.name}: ${selected.map((ad) => `${ad.name} uses “${ad.headline}”`).join("; ")}. This compares recorded copy, not causal performance.`;
        break;
      }
      case "analyze_performance":
        answer = this.#performanceAnswer(brand.name, outcomes);
        break;
      case "explain_loop_state": {
        answer = this.#loopAnswer(brand.name, outcomes, learnings[0]?.state ?? null, learnings[0]?.statement ?? null);
        proposals.push(this.#experimentProposal(scope));
        break;
      }
      case "retrieve_learnings":
        answer = learnings.length === 0
          ? `No scoped Learning Core record matched the validated retrieval for ${brand.name}.`
          : `Retrieved ${learnings.length} scoped learning${learnings.length === 1 ? "" : "s"}. The leading record is ${learnings[0]?.state}: ${learnings[0]?.statement}`;
        break;
      case "inspect_data_gaps": {
        const gaps = [
          ...(ads.length === 0 ? ["ads"] : []),
          ...(outcomes.length === 0 ? ["normalized outcomes"] : []),
          ...(learnings.length === 0 ? ["retrievable learnings"] : []),
        ];
        answer = gaps.length === 0
          ? `${brand.name} has catalog ads, normalized outcomes, and scoped learnings. Live-provider and continuous-ingestion coverage are still unverified.`
          : `${brand.name} is missing ${gaps.join(", ")}. Draper will not infer those records.`;
        break;
      }
      case "propose_experiment":
        answer = `Draper prepared a reviewable next experiment for ${brand.name}; it has not been launched.`;
        proposals.push(this.#experimentProposal(scope));
        break;
      case "propose_loop_policy_change":
        answer = `Draper prepared a reviewable Loop-policy proposal for ${brand.name}; no policy or ad account was changed.`;
        proposals.push(this.#loopPolicyProposal(scope));
        break;
      case "prepare_change_diff":
        answer = `Draper prepared a bounded experiment diff for ${brand.name}; approval records a decision but never executes external changes.`;
        proposals.push(this.#experimentProposal(scope));
        break;
    }

    if (proposals.length > 0 && ["propose_experiment", "explain_loop_state", "prepare_change_diff"].includes(input.intent)) {
      limitations.push("Proposal text is a fixture-derived template; it was not derived from this brand's recorded evidence.");
    }

    const response: DraperResponse = {
      contract: "negroni-draper-response",
      contract_version: "1.0",
      intent: input.intent,
      answer,
      scope,
      freshness: {
        as_of: freshnessAsOf ?? null,
        status: freshnessAsOf === null ? "missing" : fixtureOnly ? "fixture_only" : this.#isStale(freshnessAsOf) ? "stale" : "fresh",
      },
      evidence,
      learnings,
      assumptions: [
        `The question was mapped to the validated ${input.intent} intent.`,
        "Only records inside the supplied owner, workspace, and brand scope were included.",
      ],
      limitations,
      proposals,
      completed_actions: [],
      external_actions: [],
    };
    assertNoSecretMaterial(response, "Draper response");
    if (PRIVATE_PATH.test(JSON.stringify(response))) throw new Error("Draper response contained a private local path.");
    return response;
  }

  recordDecision(input: DraperDecisionInput): {
    contract: "negroni-draper-decision";
    contract_version: "1.0";
    decision_id: string;
    proposal_id: string;
    decision: "approved" | "rejected";
    decided_at: string;
    recorded_local_decision: true;
    completed_external_actions: never[];
    external_actions: never[];
  } {
    assertExactObject(input, [
      "scope", "proposal_id", "proposal_hash", "decision", "approved_by", "rationale", "decided_at",
    ], ["scope", "proposal_id", "proposal_hash", "decision", "approved_by", "rationale", "decided_at"]);
    assertNoSecretMaterial(input, "Draper decision input");
    if (PRIVATE_PATH.test(JSON.stringify(input))) throw new Error("Draper decision input contains a private local path.");
    const scope = assertScope(input.scope);
    const recorded = this.#store.recordDecision(scope, {
      proposal_id: assertStableId(input.proposal_id, "proposal_id"),
      proposal_hash: assertText(input.proposal_hash, "proposal_hash", 64),
      decision: input.decision,
      approved_by: assertStableId(input.approved_by, "approved_by"),
      rationale: assertText(input.rationale, "rationale", 2_000),
      decided_at: assertTimestamp(input.decided_at, "decided_at"),
    });
    return {
      contract: "negroni-draper-decision",
      contract_version: "1.0",
      ...recorded,
      recorded_local_decision: true,
      completed_external_actions: [],
      external_actions: [],
    };
  }

  #retrieval(scope: LearningScope, intent: DraperIntent, query: string | undefined, tokenBudget: number): RetrievalReceipt {
    const intentQuery: Record<DraperIntent, string> = {
      inspect_brand: "brand applicability learning",
      search_ads: "ad creative learning",
      compare_creatives: "creative experiment qualified CPL",
      analyze_performance: "performance outcome qualified CPL experiment",
      explain_loop_state: "loop experiment creative qualified CPL learning",
      retrieve_learnings: query ?? "learning evidence",
      inspect_data_gaps: "fixture evidence limitation",
      propose_experiment: "experiment hypothesis creative performance",
      propose_loop_policy_change: "loop policy confidence evidence",
      prepare_change_diff: "experiment hypothesis change",
    };
    return this.#store.searchLearnings(scope, intentQuery[intent], tokenBudget);
  }

  #performanceAnswer(brandName: string, outcomes: ReturnType<LearningCoreStorage["listOutcomes"]>): string {
    if (outcomes.length === 0) return `${brandName} has no normalized outcomes in the selected scope.`;
    const details = outcomes.map((outcome) => {
      const qualifiedCpl = outcome.qualified_leads === 0 ? null : outcome.spend / outcome.qualified_leads;
      return `${outcome.outcome_id}: ${outcome.qualified_leads} qualified leads${qualifiedCpl === null ? "" : ` at ${money(qualifiedCpl, outcome.currency)} qualified CPL`}`;
    });
    return `${brandName} has ${outcomes.length} normalized measurement records. ${details.join("; ")}.`;
  }

  #loopAnswer(
    brandName: string,
    outcomes: ReturnType<LearningCoreStorage["listOutcomes"]>,
    learningState: string | null,
    learningStatement: string | null,
  ): string {
    if (outcomes.length < 2) {
      return `${brandName}'s Loop is blocked from comparison because fewer than two normalized outcome records exist.`;
    }
    const control = outcomes.find((item) => item.outcome_id.includes("control")) ?? outcomes[0];
    const variant = outcomes.find((item) => item.outcome_id.includes("variant")) ?? outcomes[1];
    if (!control || !variant) throw new Error("Loop comparison is incomplete.");
    const controlCpl = control.qualified_leads === 0 ? null : control.spend / control.qualified_leads;
    const variantCpl = variant.qualified_leads === 0 ? null : variant.spend / variant.qualified_leads;
    const comparison = controlCpl === null || variantCpl === null
      ? "Qualified CPL cannot be compared because one arm has no qualified leads."
      : `The variant recorded ${money(variantCpl, variant.currency)} qualified CPL versus ${money(controlCpl, control.currency)} for control (${Math.round((1 - variantCpl / controlCpl) * 100)}% lower).`;
    const learning = learningState && learningStatement
      ? `The applicable learning remains ${learningState}, not automatically trusted: ${learningStatement}`
      : "No applicable learning was retrieved, so Draper will not claim a winner.";
    return `${brandName}'s Loop has a completed normalized comparison. ${comparison} ${learning}`;
  }

  #experimentProposal(scope: LearningScope): DraperProposal {
    const summary = "Run a follow-up experiment that isolates diagnostic-fee transparency from the same-day availability hook while holding offer, audience, and format constant.";
    const diff = [{ field: "creative.variable", before: "availability plus fee transparency", after: "fee transparency isolated against matched control" }];
    const stored = this.#store.createProposal(scope, { kind: "experiment", summary, diff });
    return {
      proposal_id: stored.id,
      proposal_hash: stored.hash,
      kind: "experiment",
      status: stored.status,
      summary,
      diff,
      approval_required: true,
    };
  }

  #loopPolicyProposal(scope: LearningScope): DraperProposal {
    const summary = "Require two independent normalized experiments before a supported learning can be considered for trusted status.";
    const diff = [{ field: "loop_policy.trusted_min_experiments", before: "1", after: "2" }];
    const stored = this.#store.createProposal(scope, { kind: "loop_policy_change", summary, diff });
    return {
      proposal_id: stored.id,
      proposal_hash: stored.hash,
      kind: "loop_policy_change",
      status: stored.status,
      summary,
      diff,
      approval_required: true,
    };
  }

  #isStale(freshness: string): boolean {
    return Date.parse(this.#store.now()) - Date.parse(freshness) > 7 * 24 * 60 * 60 * 1_000;
  }
}
