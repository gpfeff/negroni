"use client";

import { useEffect, useState } from "react";
import { QuizFunnelEditor } from "@/components/quiz-funnel-editor";
import type { ResearchProfile } from "@/lib/intelligence/contracts";
import type { ResearchReviewResponse } from "@/lib/review-contracts";

type CreateReadiness =
  | { status: "loading" }
  | { status: "blocked"; title: string; detail: string }
  | { status: "ready"; draftScope: string; sourceLabel: string };

type CreatePhasePageProps = {
  profile: ResearchProfile | null;
  onOpenResearchReview: () => void;
};

export function CreatePhasePage({ profile, onOpenResearchReview }: CreatePhasePageProps) {
  const [readiness, setReadiness] = useState<CreateReadiness>(profile
    ? { status: "loading" }
    : { status: "blocked", title: "Choose an offer before Create", detail: "Create needs one selected brand and offer." });

  useEffect(() => {
    const controller = new AbortController();
    if (!profile) return () => controller.abort();
    const selectedProfile = profile;
    async function loadApprovedResearch() {
      try {
        const response = await fetch(`/api/review?profile_id=${encodeURIComponent(selectedProfile.id)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json() as ResearchReviewResponse & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Research approval could not be checked.");
        if (!payload.available) {
          setReadiness({
            status: "blocked",
            title: "Create handoff is unavailable",
            detail: payload.blocker ?? "Research approval storage is not available in this build.",
          });
          return;
        }
        const approvedId = payload.workspace?.approved_revision_id;
        const fingerprint = payload.workspace?.approved_seed_sha256;
        const approved = payload.revisions.find((revision) => revision.id === approvedId);
        if (!approvedId || !fingerprint || !approved) {
          setReadiness({
            status: "blocked",
            title: "Approve Research before Create",
            detail: "Review one exact Research revision and approve its fingerprint for Phase 2.",
          });
          return;
        }
        setReadiness({
          status: "ready",
          draftScope: `${selectedProfile.id}.${approvedId}.${fingerprint}`,
          sourceLabel: `Approved Research v${approved.revision_number}`,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setReadiness({
          status: "blocked",
          title: "Create handoff could not be checked",
          detail: error instanceof Error ? error.message : "Research approval could not be checked.",
        });
      }
    }
    void loadApprovedResearch();
    return () => controller.abort();
  }, [profile]);

  if (readiness.status === "ready") {
    return <QuizFunnelEditor key={readiness.draftScope} draftScope={readiness.draftScope} sourceLabel={readiness.sourceLabel} />;
  }

  const title = readiness.status === "loading" ? "Checking the Research handoff" : readiness.title;
  const detail = readiness.status === "loading"
    ? "Negroni is verifying the approved revision and fingerprint for this offer."
    : readiness.detail;

  return (
    <div className="content-column workflow-phase-page" id="top">
      <section className="intro" aria-labelledby="create-phase-title">
        <p className="kicker">02 · Create</p>
        <h1 id="create-phase-title">Create</h1>
        <p>Turn approved research into reviewable creative and campaign experiences.</p>
      </section>

      <section className="workflow-state-panel workflow-state-blocked" aria-labelledby="create-state-title" aria-live="polite">
        <div>
          <span className="workflow-status-pill">{readiness.status === "loading" ? "checking" : "blocked"}</span>
          <h2 id="create-state-title">{title}</h2>
          <p>{detail}</p>
        </div>
        {readiness.status === "blocked" ? <button type="button" onClick={onOpenResearchReview}>Review Research</button> : null}
      </section>

      <section className="section-card workflow-handoff-card" aria-labelledby="create-handoff-title">
        <div className="section-heading"><span>02</span><div><h2 id="create-handoff-title">Required handoff</h2><p>One approved revision keeps every draft tied to the right offer.</p></div></div>
        <ul className="workflow-artifact-list">
          <li><code>creative-brief.json</code><span>Approved Research evidence and its immutable fingerprint.</span></li>
        </ul>
      </section>

      <details className="advanced-details workflow-safety-details">
        <summary>Safety and evidence <small>Why Create stops before using an unapproved brief</small></summary>
        <p>Drafting does not publish creative, submit a form, spend money, or authorize an ad-account change.</p>
      </details>
    </div>
  );
}
