"use client";

import { type ChangeEvent, useRef, useState } from "react";
import { TwoSidedBand } from "@/components/ui/two-sided-band";
import { StatusPill } from "@/components/ui/status-pill";
import { generateProjectBrief } from "@/lib/contracts/brief";
import { SUPPORTING_OUTPUT_CONTRACT } from "@/lib/contracts/defaults";
import { downloadText } from "@/lib/contracts/download";
import { validateIntake } from "@/lib/contracts/preflight";
import {
  serializeCanonicalIntake,
  serializeIntakePackage,
} from "@/lib/contracts/serialization";
import { useWorkspace } from "@/lib/workspace/store";

function GateList({
  items,
  empty,
}: {
  items: string[];
  empty: string;
}) {
  return items.length ? (
    <ul className="gate-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  ) : (
    <p className="muted">{empty}</p>
  );
}

export function PreflightView() {
  const { activeProject, importProject, setView } = useWorkspace();
  const importInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  if (!activeProject) return null;

  const preflight = validateIntake(
    activeProject.intake,
    activeProject.field_states,
  );
  const brief = generateProjectBrief(
    activeProject.intake,
    activeProject.field_states,
    activeProject.updated_at.slice(0, 10),
  );

  const onImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const project = importProject(await file.text());
      setMessage(`Imported ${project.intake.project.name || "untitled project"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed.");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <section className="view-stack" aria-labelledby="preflight-title">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Preflight & research plan</p>
          <h1 id="preflight-title">
            {preflight.passed ? "Ready to research" : "Correct the brief before a run"}
          </h1>
        </div>
        <div className="preflight-state">
          <StatusPill state={preflight.passed ? "ready" : "draft"} />
          <span>
            {preflight.issues.length} required gap
            {preflight.issues.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <TwoSidedBand compact />

      <div className="preflight-actions">
        <button
          type="button"
          className="button button-secondary"
          onClick={() =>
            downloadText(
              "canonical-intake.json",
              serializeCanonicalIntake(activeProject),
              "application/json;charset=utf-8",
            )
          }
        >
          Export canonical JSON
        </button>
        <button
          type="button"
          className="button button-secondary"
          onClick={() =>
            downloadText(
              "workbench-project.json",
              serializeIntakePackage(activeProject),
              "application/json;charset=utf-8",
            )
          }
        >
          Export project package
        </button>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => downloadText("00-project-brief.md", brief)}
        >
          Export 00-project-brief.md
        </button>
        <button
          type="button"
          className="button button-quiet"
          onClick={() => importInput.current?.click()}
        >
          Import JSON
        </button>
        <input
          ref={importInput}
          className="visually-hidden"
          type="file"
          accept=".json,application/json"
          onChange={onImport}
        />
      </div>
      {message ? (
        <p className="inline-message" role="status">
          {message}
        </p>
      ) : null}

      <div className="preflight-grid">
        <article className="preflight-card">
          <p className="eyebrow">Minimum brief</p>
          <h2>{preflight.passed ? "Passed" : "Missing required inputs"}</h2>
          {preflight.issues.length ? (
            <ul className="issue-list">
              {preflight.issues.map((issue) => (
                <li key={issue.path}>
                  <code>{issue.path}</code>
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              Market, geography, language, acquisition model, conversion unit,
              both target sides, platform boundary, and publisher treatment are
              explicit.
            </p>
          )}
          {!preflight.passed ? (
            <button
              type="button"
              className="button button-primary"
              onClick={() => setView("intake")}
            >
              Correct intake
            </button>
          ) : null}
        </article>

        <article className="preflight-card">
          <p className="eyebrow">Research unknowns</p>
          <h2>{preflight.research_unknowns.length} questions to investigate</h2>
          <GateList
            items={preflight.research_unknowns}
            empty="No fields are explicitly marked unknown or research this."
          />
        </article>

        <article className="preflight-card preflight-card-gates">
          <p className="eyebrow">Launch gates</p>
          <h2>{preflight.launch_gates.length} unresolved controls</h2>
          <GateList
            items={preflight.launch_gates}
            empty="No launch gate was identified from this intake."
          />
          <p className="card-footnote">
            These do not automatically block research. They do block a launch
            conclusion until verified.
          </p>
        </article>

        <article className="preflight-card">
          <p className="eyebrow">Platform boundary</p>
          <h2>Proposed non-search coverage</h2>
          <GateList
            items={preflight.proposed_platforms}
            empty="No platform plan supplied."
          />
          <h3>Explicit exclusions</h3>
          <GateList
            items={preflight.excluded_platforms}
            empty="No additional platforms excluded."
          />
        </article>
      </div>

      <div className="allowlist-banner">
        <div>
          <p className="eyebrow">External-action allowlist</p>
          <h2>
            {preflight.external_actions_allowed.length
              ? preflight.external_actions_allowed.join(", ")
              : "Empty"}
          </h2>
        </div>
        <p>
          No paid click, form submission, call, outreach, purchase, campaign,
          publish, sharing change, or live mutation is authorized by default.
        </p>
      </div>

      <div className="section-heading">
        <div>
          <p className="eyebrow">Expected numbered outputs</p>
          <h2>Ten-section full-package contract</h2>
        </div>
        <p>
          A scan may remain compact. A full package is complete only after
          evidence and native-document parity gates pass.
        </p>
      </div>
      <ol className="output-contract-list">
        {preflight.expected_outputs.map((output) => (
          <li key={output.section_id}>
            <span>{output.section_id}</span>
            <div>
              <strong>{output.title}</strong>
              <code>{output.markdown_path}</code>
            </div>
          </li>
        ))}
      </ol>
      <div className="supporting-contract supporting-contract-compact">
        <div>
          <p className="eyebrow">Conditional supporting outputs</p>
          <h2>No empty placeholders</h2>
        </div>
        <ul>
          {SUPPORTING_OUTPUT_CONTRACT.map((output) => (
            <li key={output.path}>
              <code>{output.path}</code>
              <span>{output.condition}</span>
            </li>
          ))}
        </ul>
      </div>

      <details className="brief-preview">
        <summary>Normalized 00-project-brief.md</summary>
        <pre>{brief}</pre>
      </details>

      <div className="review-actions">
        <button
          type="button"
          className="button button-primary"
          disabled={!preflight.passed}
          onClick={() => setView("run")}
        >
          Open run workspace
        </button>
      </div>
    </section>
  );
}
