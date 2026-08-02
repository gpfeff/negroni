"use client";

import {
  getCampaignPhase,
  getPhaseScreenState,
  type CampaignPhaseId,
  type PhaseVerification,
  type WorkflowNavigationTarget,
} from "@/lib/campaign-workflow";

type WorkflowPhasePageProps = {
  phaseId: Extract<CampaignPhaseId, "launch" | "iterate" | "loop">;
  onNavigate: (target: WorkflowNavigationTarget) => void;
  verification?: PhaseVerification;
};

export function WorkflowPhasePage({ phaseId, onNavigate, verification }: WorkflowPhasePageProps) {
  const phase = getCampaignPhase(phaseId);
  const screenState = getPhaseScreenState(phaseId, verification);

  return (
    <div className="content-column workflow-phase-page" id="top">
      <section className="intro" aria-labelledby="workflow-phase-title">
        <p className="kicker">{phase.number} · {screenState.status.replace("_", " ")}</p>
        <h1 id="workflow-phase-title">{phase.name}</h1>
        <p>{phase.primary_job}</p>
      </section>

      <section className={`workflow-state-panel workflow-state-${screenState.status}`} aria-labelledby="workflow-state-title" aria-live="polite">
        <div>
          <span className="workflow-status-pill">{screenState.status.replace("_", " ")}</span>
          <h2 id="workflow-state-title">{screenState.title}</h2>
          <p>{screenState.detail}</p>
        </div>
        <button type="button" onClick={() => onNavigate(screenState.action.target)}>{screenState.action.label}</button>
      </section>

      <section className="section-card workflow-handoff-card" aria-labelledby="workflow-handoff-title">
        <div className="section-heading"><span>{phase.number}</span><div><h2 id="workflow-handoff-title">Required handoff</h2><p>Only verified, reviewable artifacts move the work forward.</p></div></div>
        <ul className="workflow-artifact-list">
          {phase.inputs.map((input) => <li key={input.artifact}><code>{input.artifact}</code><span>{input.description}</span></li>)}
          {phase.outputs.map((output) => <li className="workflow-output" key={output.artifact}><code>{output.artifact}</code><span>{output.description}</span></li>)}
        </ul>
      </section>

      <details className="advanced-details workflow-safety-details">
        <summary>Safety and evidence <small>Why this phase stops and what approval protects</small></summary>
        <p>{phase.safety_boundary}</p>
      </details>
    </div>
  );
}
