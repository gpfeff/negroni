"use client";

import { useEffect, useMemo, useState } from "react";

type StepType = "intro" | "single_choice" | "location" | "contact" | "result";
type EditorPanel = "content" | "logic" | "tracking";

type FunnelStep = {
  id: string;
  type: StepType;
  label: string;
  title: string;
  description: string;
  required: boolean;
  choices?: string[];
};

type LocalDraft = Partial<{
  name: string;
  steps: FunnelStep[];
  resumeEnabled: boolean;
  utmEnabled: boolean;
  clickIdsEnabled: boolean;
  savedAt: string;
}>;

const DRAFT_KEY = "negroni.quiz-funnel.lead-capture.v1";

const INITIAL_STEPS: FunnelStep[] = [
  { id: "intro", type: "intro", label: "Welcome", title: "Find your best next step", description: "Answer a few quick questions to see the most relevant option for you.", required: false },
  { id: "need", type: "single_choice", label: "Lead need", title: "What are you looking for help with?", description: "Choose the closest match so we can tailor the next step.", required: true, choices: ["I need help now", "I am comparing options", "I am planning ahead"] },
  { id: "timeline", type: "single_choice", label: "Timeline", title: "When would you like to get started?", description: "This helps set the right follow-up expectation.", required: true, choices: ["As soon as possible", "Within 30 days", "Just researching"] },
  { id: "location", type: "location", label: "Location", title: "Where should we focus your options?", description: "A ZIP code lets us show availability without asking for your full address.", required: true },
  { id: "contact", type: "contact", label: "Lead capture", title: "Where should we send your options?", description: "You are one step away from a tailored recommendation.", required: true },
  { id: "result", type: "result", label: "Result", title: "Your tailored next step is ready", description: "We will match your answers to the right follow-up. No live lead delivery is connected in this draft.", required: false },
];

const STEP_TYPE_LABEL: Record<StepType, string> = {
  intro: "Intro",
  single_choice: "Single choice",
  location: "ZIP capture",
  contact: "Lead capture",
  result: "Result",
};

function copySteps(steps: FunnelStep[]) {
  return steps.map((step) => ({ ...step, choices: step.choices ? [...step.choices] : undefined }));
}

function readLocalDraft(): LocalDraft {
  if (typeof window === "undefined") return {};
  try {
    const draft = window.localStorage.getItem(DRAFT_KEY);
    if (!draft) return {};
    const parsed = JSON.parse(draft) as LocalDraft;
    return Array.isArray(parsed.steps) && parsed.steps.length ? parsed : { ...parsed, steps: undefined };
  } catch {
    return {};
  }
}

export function QuizFunnelEditor() {
  const [name, setName] = useState("Lead capture quiz");
  const [steps, setSteps] = useState<FunnelStep[]>(INITIAL_STEPS);
  const [selectedStepId, setSelectedStepId] = useState(INITIAL_STEPS[0].id);
  const [panel, setPanel] = useState<EditorPanel>("content");
  const [preview, setPreview] = useState<"phone" | "desktop">("phone");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [resumeEnabled, setResumeEnabled] = useState(true);
  const [utmEnabled, setUtmEnabled] = useState(true);
  const [clickIdsEnabled, setClickIdsEnabled] = useState(true);
  const [previewAnswer, setPreviewAnswer] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const draft = readLocalDraft();
      if (draft.name) setName(draft.name);
      if (draft.steps) {
        const restored = copySteps(draft.steps);
        setSteps(restored);
        setSelectedStepId(restored[0]?.id ?? INITIAL_STEPS[0].id);
      }
      if (typeof draft.resumeEnabled === "boolean") setResumeEnabled(draft.resumeEnabled);
      if (typeof draft.utmEnabled === "boolean") setUtmEnabled(draft.utmEnabled);
      if (typeof draft.clickIdsEnabled === "boolean") setClickIdsEnabled(draft.clickIdsEnabled);
      if (draft.savedAt) setSavedAt(draft.savedAt);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const selectedStep = useMemo(() => steps.find((step) => step.id === selectedStepId) ?? steps[0], [selectedStepId, steps]);
  const selectedIndex = steps.findIndex((step) => step.id === selectedStep?.id);

  function saveDraft() {
    const now = new Date().toISOString();
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ name, steps, resumeEnabled, utmEnabled, clickIdsEnabled, savedAt: now }));
    setSavedAt(now);
  }

  function updateStep(patch: Partial<FunnelStep>) {
    if (!selectedStep) return;
    setSteps((current) => current.map((step) => step.id === selectedStep.id ? { ...step, ...patch } : step));
  }

  function updateChoice(index: number, value: string) {
    if (!selectedStep?.choices) return;
    const choices = [...selectedStep.choices];
    choices[index] = value;
    updateStep({ choices });
  }

  function addQuestion() {
    const id = `question-${Date.now()}`;
    const newStep: FunnelStep = {
      id,
      type: "single_choice",
      label: "New question",
      title: "What should we ask next?",
      description: "Use this answer to personalize the lead path.",
      required: true,
      choices: ["First option", "Second option"],
    };
    setSteps((current) => [...current.slice(0, -1), newStep, current[current.length - 1]]);
    setSelectedStepId(id);
    setPanel("content");
  }

  function moveSelected(offset: number) {
    if (selectedIndex < 0) return;
    const nextIndex = selectedIndex + offset;
    if (nextIndex < 0 || nextIndex >= steps.length) return;
    setSteps((current) => {
      const next = [...current];
      [next[selectedIndex], next[nextIndex]] = [next[nextIndex], next[selectedIndex]];
      return next;
    });
  }

  function deleteSelected() {
    if (!selectedStep || steps.length <= 2 || selectedStep.type === "intro" || selectedStep.type === "result") return;
    const nextSteps = steps.filter((step) => step.id !== selectedStep.id);
    setSteps(nextSteps);
    setSelectedStepId(nextSteps[Math.max(0, selectedIndex - 1)].id);
  }

  return (
    <div className="quiz-editor" id="top">
      <header className="quiz-editor-header">
        <div>
          <p className="kicker">Create · Quiz Funnels</p>
          <label className="quiz-name-label" htmlFor="quiz-name">Funnel name</label>
          <input id="quiz-name" className="quiz-name-input" value={name} onChange={(event) => setName(event.target.value)} />
          <p>One-question-at-a-time lead capture, built for paid traffic and reviewable before anything goes live.</p>
        </div>
        <div className="quiz-header-actions">
          <span className="quiz-save-state" aria-live="polite">{savedAt ? `Saved locally ${new Intl.DateTimeFormat("en-US", { timeStyle: "short" }).format(new Date(savedAt))}` : "Local draft"}</span>
          <button type="button" onClick={saveDraft}>Save draft</button>
          <button type="button" disabled title="Publishing requires an approved delivery and launch package.">Publish needs approval</button>
        </div>
      </header>

      <div className="quiz-editor-toolbar" aria-label="Quiz editor controls">
        <div className="quiz-editor-tabs" role="tablist" aria-label="Editor panel">
          {(["content", "logic", "tracking"] as const).map((item) => (
            <button key={item} className={panel === item ? "selected" : ""} type="button" role="tab" aria-selected={panel === item} onClick={() => setPanel(item)}>{item === "content" ? "Content" : item === "logic" ? "Flow & logic" : "Tracking"}</button>
          ))}
        </div>
        <div className="preview-toggle" aria-label="Preview device">
          <button type="button" className={preview === "phone" ? "selected" : ""} onClick={() => setPreview("phone")}>Phone</button>
          <button type="button" className={preview === "desktop" ? "selected" : ""} onClick={() => setPreview("desktop")}>Desktop</button>
        </div>
      </div>

      <div className="quiz-editor-grid">
        <aside className="quiz-step-rail" aria-label="Funnel steps">
          <div className="quiz-rail-heading"><div><span>Flow</span><strong>{steps.length} screens</strong></div><button type="button" onClick={addQuestion}>+ Question</button></div>
          <ol>
            {steps.map((step, index) => (
              <li key={step.id}>
                <button type="button" className={selectedStep?.id === step.id ? "selected" : ""} onClick={() => { setSelectedStepId(step.id); setPreviewAnswer(""); }} aria-current={selectedStep?.id === step.id ? "step" : undefined}>
                  <span>{String(index + 1).padStart(2, "0")}</span><div><small>{STEP_TYPE_LABEL[step.type]}</small><strong>{step.label}</strong></div><b aria-hidden="true">›</b>
                </button>
              </li>
            ))}
          </ol>
          <div className="quiz-rail-foot"><span>●</span><p>Lead delivery is not connected. This is a local, editable draft.</p></div>
        </aside>

        <section className="quiz-canvas" aria-label="Live funnel preview">
          <div className="quiz-canvas-label"><span>Live preview</span><small>{preview === "phone" ? "390 px mobile frame" : "Responsive desktop frame"}</small></div>
          <div className={`quiz-preview-frame quiz-preview-${preview}`}>
            <div className="quiz-preview-top"><span className="quiz-preview-brand"><i /> Negroni</span><span>{selectedIndex + 1} / {steps.length}</span></div>
            <div className="quiz-progress" aria-label={`Step ${selectedIndex + 1} of ${steps.length}`}><i style={{ width: `${Math.max(8, ((selectedIndex + 1) / steps.length) * 100)}%` }} /></div>
            <div className="quiz-preview-content">
              <span className="quiz-preview-eyebrow">{selectedStep?.type === "contact" ? "Almost there" : selectedStep?.type === "result" ? "Your result" : "Quick question"}</span>
              <h2>{selectedStep?.title}</h2>
              <p>{selectedStep?.description}</p>
              {selectedStep?.type === "intro" ? <button type="button" className="quiz-preview-cta">Start my check <span>→</span></button> : null}
              {selectedStep?.type === "single_choice" ? <div className="quiz-preview-choices">{selectedStep.choices?.map((choice) => <button type="button" key={choice} className={previewAnswer === choice ? "selected" : ""} onClick={() => setPreviewAnswer(choice)}><span>{choice}</span><b>›</b></button>)}</div> : null}
              {selectedStep?.type === "location" ? <div className="quiz-preview-form"><label htmlFor="preview-zip">ZIP code</label><input id="preview-zip" inputMode="numeric" placeholder="Enter ZIP code" /><button type="button" className="quiz-preview-cta">Continue <span>→</span></button></div> : null}
              {selectedStep?.type === "contact" ? <div className="quiz-preview-form"><label htmlFor="preview-name">First name</label><input id="preview-name" placeholder="Your first name" /><label htmlFor="preview-email">Email address</label><input id="preview-email" type="email" placeholder="you@example.com" /><button type="button" className="quiz-preview-cta">See my options <span>→</span></button><small>Preview only — no lead is submitted.</small></div> : null}
              {selectedStep?.type === "result" ? <div className="quiz-result-card"><span>Recommended path</span><strong>Talk with a specialist</strong><p>We will use the answers above to guide the next conversation.</p><button type="button" className="quiz-preview-cta">Choose a time <span>→</span></button></div> : null}
            </div>
            <div className="quiz-preview-footer"><button type="button">← Back</button><span>Private &amp; secure</span></div>
          </div>
        </section>

        <aside className="quiz-inspector" aria-label="Question settings">
          {panel === "content" ? <>
            <div className="quiz-inspector-heading"><span>Screen settings</span><strong>{selectedStep ? STEP_TYPE_LABEL[selectedStep.type] : "Select a screen"}</strong></div>
            {selectedStep ? <div className="quiz-inspector-fields">
              <label htmlFor="step-label">Internal label<input id="step-label" value={selectedStep.label} onChange={(event) => updateStep({ label: event.target.value })} /></label>
              <label htmlFor="step-title">Question<input id="step-title" value={selectedStep.title} onChange={(event) => updateStep({ title: event.target.value })} /></label>
              <label htmlFor="step-description">Supporting copy<textarea id="step-description" rows={3} value={selectedStep.description} onChange={(event) => updateStep({ description: event.target.value })} /></label>
              {selectedStep.choices ? <fieldset className="quiz-choice-editor"><legend>Answer choices</legend>{selectedStep.choices.map((choice, index) => <label key={`${selectedStep.id}-${index}`}><span>{String.fromCharCode(65 + index)}</span><input value={choice} onChange={(event) => updateChoice(index, event.target.value)} /></label>)}<button type="button" onClick={() => updateStep({ choices: [...selectedStep.choices!, "New option"] })}>+ Add choice</button></fieldset> : null}
              <label className="quiz-switch"><input type="checkbox" checked={selectedStep.required} onChange={(event) => updateStep({ required: event.target.checked })} /><span><strong>Required answer</strong><small>Visitors must respond before continuing.</small></span></label>
            </div> : null}
            <div className="quiz-step-actions"><button type="button" onClick={() => moveSelected(-1)} disabled={selectedIndex <= 0}>Move up</button><button type="button" onClick={() => moveSelected(1)} disabled={selectedIndex >= steps.length - 1}>Move down</button><button type="button" onClick={deleteSelected} disabled={!selectedStep || selectedStep.type === "intro" || selectedStep.type === "result"}>Delete</button></div>
          </> : null}
          {panel === "logic" ? <>
            <div className="quiz-inspector-heading"><span>Flow &amp; logic</span><strong>Safe default path</strong></div>
            <div className="quiz-logic-card"><span className="logic-state">Current screen</span><strong>{selectedStep?.label}</strong><p>Every answer continues to the next reachable screen. Add rules when this question should qualify or route a lead differently.</p><button type="button">+ Add answer rule</button></div>
            <div className="quiz-logic-path">{steps.map((step, index) => <div key={step.id} className={step.id === selectedStep?.id ? "selected" : ""}><span>{String(index + 1).padStart(2, "0")}</span><strong>{step.label}</strong>{index < steps.length - 1 ? <i>↓</i> : null}</div>)}</div>
            <p className="quiz-inspector-note">No branch bypasses the lead-capture screen. Configure an approved result destination before publishing.</p>
          </> : null}
          {panel === "tracking" ? <>
            <div className="quiz-inspector-heading"><span>Attribution &amp; resume</span><strong>Privacy-aware draft</strong></div>
            <label className="quiz-switch"><input type="checkbox" checked={utmEnabled} onChange={(event) => setUtmEnabled(event.target.checked)} /><span><strong>Persist approved UTMs</strong><small>utm_source, utm_medium, utm_campaign, utm_content, utm_term</small></span></label>
            <label className="quiz-switch"><input type="checkbox" checked={clickIdsEnabled} onChange={(event) => setClickIdsEnabled(event.target.checked)} /><span><strong>Persist click IDs</strong><small>gclid, fbclid, ttclid, msclkid</small></span></label>
            <label className="quiz-switch"><input type="checkbox" checked={resumeEnabled} onChange={(event) => setResumeEnabled(event.target.checked)} /><span><strong>Resume this draft</strong><small>Keep non-sensitive answers in this browser session.</small></span></label>
            <div className="quiz-events-card"><strong>Event plan</strong><ul><li>quiz_view</li><li>quiz_start</li><li>quiz_step_view</li><li>quiz_answer</li><li>lead_submit_attempt</li><li>lead_submit_success</li></ul><p>Events carry stable step IDs only—never raw email, phone, ZIP, or free text.</p></div>
            <p className="quiz-inspector-note">No analytics or CRM endpoint is connected. Save this contract now; attach an approved adapter later.</p>
          </> : null}
        </aside>
      </div>
    </div>
  );
}
