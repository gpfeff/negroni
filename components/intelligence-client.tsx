"use client";

import { useEffect, useState } from "react";
import { CONVERSION_OPTIONS, createEmptyIntake, DEPTH_OPTIONS, FIELD_DEFINITIONS } from "@/lib/intelligence/defaults";
import type { FieldState, IntelligenceIntake, OptionalFieldId, RunCapability, RunError, RunResult } from "@/lib/intelligence/contracts";
import { parseRunResult, RUNNER_BLOCKER, validateIntake } from "@/lib/intelligence/validation";

const STATE_LABELS: Record<FieldState, string> = {
  answered: "Answered",
  unknown: "Unknown",
  research_this: "Research this",
  not_applicable: "Not applicable",
};

function downloadMarkdown(result: RunResult) {
  const blob = new Blob([result.outputs.markdown.content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.outputs.markdown.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function IntelligenceClient() {
  const [intake, setIntake] = useState<IntelligenceIntake>(createEmptyIntake);
  const [files, setFiles] = useState<File[]>([]);
  const [capability, setCapability] = useState<RunCapability>({ available: false, status: "blocked", blocker: RUNNER_BLOCKER });
  const [checking, setChecking] = useState(true);
  const [running, setRunning] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/run", { cache: "no-store" })
      .then(async (response) => (await response.json()) as RunCapability)
      .then((value) => { if (active) setCapability(value); })
      .catch(() => { if (active) setCapability({ available: false, status: "blocked", blocker: RUNNER_BLOCKER }); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  function updateField(id: OptionalFieldId, update: Partial<IntelligenceIntake["fields"][OptionalFieldId]>) {
    setIntake((current) => ({
      ...current,
      fields: { ...current.fields, [id]: { ...current.fields[id], ...update } },
    }));
  }

  function selectFiles(nextFiles: FileList | null) {
    const selected = Array.from(nextFiles ?? []).slice(0, 5);
    setFiles(selected);
    setIntake((current) => ({
      ...current,
      attachments: selected.map((file) => ({ name: file.name, size: file.size, type: file.type, last_modified: file.lastModified })),
    }));
  }

  async function runResearch() {
    const validationErrors = validateIntake(intake);
    setErrors(validationErrors);
    setResult(null);
    setRunError(null);
    if (validationErrors.length || !capability.available) {
      if (!capability.available) setRunError(capability.blocker ?? RUNNER_BLOCKER);
      document.getElementById("run-status")?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    setRunning(true);
    try {
      const body = new FormData();
      body.set("intake", JSON.stringify(intake));
      files.forEach((file) => body.append("attachments", file, file.name));
      const response = await fetch("/api/run", { method: "POST", body });
      const payload = (await response.json()) as RunResult | RunError;
      if (!response.ok || "error" in payload) throw new Error("error" in payload ? payload.error : "The research run failed.");
      setResult(parseRunResult(payload, intake.project_name));
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "The research run failed.");
    } finally {
      setRunning(false);
      document.getElementById("run-status")?.scrollIntoView({ behavior: "smooth" });
    }
  }

  return (
    <main className="page-shell">
      <header className="masthead">
        <a className="brand" href="#intake" aria-label="PHASE 1: RESEARCH home">
          <span className="brand-mark">L</span>
          <span>PHASE 1: RESEARCH</span>
        </a>
        <span className="header-note">One intake · Three deliverables</span>
      </header>

      <div className="content-column">
        <section className="intro" aria-labelledby="page-title">
          <p className="kicker">Research intake</p>
          <h1 id="page-title">Start with what you know.</h1>
          <p>We’ll turn your current context—and the gaps inside it—into a complete market report, an evidence-backed competitor sheet, and a matching Markdown file.</p>
        </section>

        <section className="section-card" id="intake" aria-labelledby="intake-title">
          <div className="section-heading">
            <span>1</span>
            <div><h2 id="intake-title">Intake</h2><p>Only the project name and some market context are required.</p></div>
          </div>

          <div className="field-stack">
            <label className="field-label" htmlFor="project-name">Project or report name <strong>Required</strong></label>
            <input id="project-name" value={intake.project_name} onChange={(event) => setIntake((current) => ({ ...current, project_name: event.target.value }))} placeholder="Example: Regional roofing lead opportunity" autoComplete="off" />

            <label className="field-label" htmlFor="market-context">Tell us everything you currently know about this lead-generation opportunity. <strong>Required</strong></label>
            <textarea id="market-context" className="context-input" value={intake.market_context} onChange={(event) => setIntake((current) => ({ ...current, market_context: event.target.value }))} placeholder="Paste notes, goals, assumptions, buyer details, audience context, economics, constraints, open questions—anything useful. Missing details will become research questions, not invented facts." />
          </div>

          <details className="detail-disclosure">
            <summary><span>Add more detail</span><small>Optional structured fields</small></summary>
            <div className="optional-grid">
              {FIELD_DEFINITIONS.map((field) => {
                const current = intake.fields[field.id];
                const options = field.kind === "conversion" ? CONVERSION_OPTIONS : field.kind === "depth" ? DEPTH_OPTIONS : null;
                return (
                  <div className="optional-field" key={field.id}>
                    <div className="optional-label-row">
                      <label htmlFor={`${field.id}-value`}>{field.label}</label>
                      <select aria-label={`${field.label} answer status`} value={current.state} onChange={(event) => updateField(field.id, { state: event.target.value as FieldState, value: event.target.value === "answered" ? current.value : "" })}>
                        {Object.entries(STATE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                    {current.state === "answered" ? (
                      options ? (
                        <select id={`${field.id}-value`} value={current.value} onChange={(event) => updateField(field.id, { value: event.target.value })}>
                          <option value="">Select…</option>{options.map((option) => <option key={option}>{option}</option>)}
                        </select>
                      ) : (
                        <textarea id={`${field.id}-value`} className="short-input" rows={field.kind === "urls" ? 3 : 2} value={current.value} onChange={(event) => updateField(field.id, { value: event.target.value })} placeholder={field.hint} />
                      )
                    ) : <p className="field-state-note">{current.state === "research_this" ? "This will be an explicit research question." : current.state === "unknown" ? "The report will preserve this as unknown." : "This field will be excluded."}</p>}
                  </div>
                );
              })}

              <div className="optional-field attachment-field">
                <div className="optional-label-row"><label htmlFor="attachments">File attachments</label><span>Up to 5 files</span></div>
                <input id="attachments" type="file" multiple onChange={(event) => selectFiles(event.target.files)} />
                {files.length ? <ul className="file-list">{files.map((file) => <li key={`${file.name}-${file.lastModified}`}>{file.name} <span>{Math.ceil(file.size / 1024)} KB</span></li>)}</ul> : <p className="field-state-note">Files are forwarded to the research runner and are not stored by this page.</p>}
              </div>
            </div>
          </details>

          {errors.length ? <div className="validation-box" role="alert"><strong>Check the intake</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div> : null}
          <div className="run-row">
            <button className="run-button" type="button" onClick={runResearch} disabled={checking || running || !capability.available}>{running ? "Research in progress…" : checking ? "Checking research access…" : "Run intelligence research"}</button>
            <p>Public research and creation of the three requested files only. No outreach, forms, purchases, campaigns, or account changes.</p>
          </div>
        </section>

        <section className="section-card" id="run-status" aria-labelledby="status-title">
          <div className="section-heading"><span>2</span><div><h2 id="status-title">Run status</h2><p>Research and file creation are reported separately from interface state.</p></div></div>
          <div className={`status-panel ${result ? "status-complete" : runError || (!checking && !capability.available) ? "status-blocked" : ""}`} aria-live="polite">
            <div><span className="status-dot" /><strong>{running ? "Researching" : result ? "Complete" : runError || (!checking && !capability.available) ? "Blocked" : "Not started"}</strong></div>
            <p>{running ? "The canonical skill is researching the market and creating the three deliverables." : result ? `Completed ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(result.completed_at))}` : runError ?? capability.blocker ?? "Complete the intake when you are ready."}</p>
          </div>
          {result?.limitations.length ? <div className="limitations"><strong>Limitations</strong><p>{result.limitations.join(" ")}</p></div> : <div className="limitations"><strong>Limitations</strong><p>{!capability.available && !checking ? "Live research and native Google-file creation are unavailable until a secure runner and Google Workspace connector are configured." : "Research limitations will appear here after the run."}</p></div>}
        </section>

        <section className="section-card" id="outputs" aria-labelledby="outputs-title">
          <div className="section-heading"><span>3</span><div><h2 id="outputs-title">Outputs</h2><p>Exactly three complete deliverables. Nothing else.</p></div></div>
          <div className="output-grid">
            <a className={result ? "output-card" : "output-card output-disabled"} href={result?.outputs.google_doc.url ?? undefined} target="_blank" rel="noreferrer" aria-disabled={!result} onClick={(event) => { if (!result) event.preventDefault(); }}><span className="output-icon">D</span><div><strong>Open Google Doc</strong><small>{result?.outputs.google_doc.title ?? "Complete main intelligence report"}</small></div><span aria-hidden="true">↗</span></a>
            <a className={result ? "output-card" : "output-card output-disabled"} href={result?.outputs.google_sheet.url ?? undefined} target="_blank" rel="noreferrer" aria-disabled={!result} onClick={(event) => { if (!result) event.preventDefault(); }}><span className="output-icon sheet-icon">S</span><div><strong>Open Google Sheet</strong><small>{result?.outputs.google_sheet.title ?? "Complete competitor report"}</small></div><span aria-hidden="true">↗</span></a>
            <button className={result ? "output-card" : "output-card output-disabled"} type="button" disabled={!result} onClick={() => result && downloadMarkdown(result)}><span className="output-icon markdown-icon">M</span><div><strong>Download Markdown</strong><small>{result?.outputs.markdown.filename ?? "Portable main report"}</small></div><span aria-hidden="true">↓</span></button>
          </div>
        </section>
      </div>
      <footer><span>PHASE 1: RESEARCH</span><p>Evidence is labeled. Unknowns stay unknown. Material claims keep their sources.</p></footer>
    </main>
  );
}
