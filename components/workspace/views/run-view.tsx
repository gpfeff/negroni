"use client";

import { useEffect, useState } from "react";
import { StatusPill } from "@/components/ui/status-pill";
import { validateIntake } from "@/lib/contracts/preflight";
import {
  detectLocalRuntime,
  executeLocalCodex,
  type RuntimeCapability,
} from "@/lib/runtime/browser-adapter";
import { useWorkspace } from "@/lib/workspace/store";

const INITIAL_CAPABILITY: RuntimeCapability = {
  available: false,
  mode: "codex_app_server",
  label: "Local Codex runtime",
  detail: "Checking localhost capability…",
  codex_version: null,
  skill_available: false,
};

export function RunView() {
  const {
    activeProject,
    executeFixture,
    applyRunManifest,
    markResearching,
    markRunFailed,
    setView,
  } = useWorkspace();
  const [capability, setCapability] =
    useState<RuntimeCapability>(INITIAL_CAPABILITY);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void detectLocalRuntime().then(setCapability);
  }, []);

  if (!activeProject) return null;
  const preflight = validateIntake(
    activeProject.intake,
    activeProject.field_states,
  );
  const manifest = activeProject.run_manifest;

  const onLocalRun = async () => {
    setRunning(true);
    setMessage(
      "Starting an explicit local skill run. No fixture fallback will occur.",
    );
    markResearching();
    try {
      const result = await executeLocalCodex(activeProject);
      applyRunManifest(result);
      setMessage("Local Codex run completed. Review lane states and evidence.");
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "The local Codex run failed.";
      markRunFailed(detail);
      setMessage(detail);
    } finally {
      setRunning(false);
    }
  };

  const onFixture = () => {
    try {
      executeFixture();
      setMessage(
        "Synthetic demonstration loaded. Nothing shown is a market finding.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Fixture run failed.");
    }
  };

  return (
    <section className="view-stack" aria-labelledby="run-title">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Run workspace</p>
          <h1 id="run-title">Independent lanes, explicit blockers</h1>
        </div>
        <p>
          Lane state is not collapsed into a progress percentage. A complete
          brief can still lead to partial research or blocked publication.
        </p>
      </div>

      <div className="runtime-grid">
        <article className="runtime-card runtime-card-real">
          <div className="runtime-card-heading">
            <div>
              <p className="eyebrow">Real local executor</p>
              <h2>Codex App Server adapter</h2>
            </div>
            <StatusPill state={capability.available ? "ready" : "blocked"} />
          </div>
          <p>{capability.detail}</p>
          <dl>
            <div>
              <dt>Canonical skill</dt>
              <dd>
                {capability.skill_available ? "Resolved and enabled" : "Unavailable"}
              </dd>
            </div>
            <div>
              <dt>Codex</dt>
              <dd>{capability.codex_version ?? "Not detected"}</dd>
            </div>
            <div>
              <dt>External actions</dt>
              <dd>
                {activeProject.intake.constraints.external_actions_allowed.length
                  ? activeProject.intake.constraints.external_actions_allowed.join(
                      ", ",
                    )
                  : "None"}
              </dd>
            </div>
          </dl>
          <button
            type="button"
            className="button button-primary"
            disabled={!capability.available || !preflight.passed || running}
            onClick={onLocalRun}
          >
            {running ? "Running locally…" : "Run canonical skill locally"}
          </button>
          <small>
            Uses a server-spawned stdio client. The App Server is never exposed to
            the browser or public network.
          </small>
        </article>

        <article className="runtime-card runtime-card-fixture">
          <div className="runtime-card-heading">
            <div>
              <p className="eyebrow">Preview and CI executor</p>
              <h2>Deterministic synthetic fixture</h2>
            </div>
            <StatusPill state="fixture" />
          </div>
          <p>
            Demonstrates run state, evidence review, section output, and delivery
            limitations. It performs no research and never becomes a silent
            fallback.
          </p>
          <dl>
            <div>
              <dt>Market</dt>
              <dd>Neutral invented community workshop</dd>
            </div>
            <div>
              <dt>Evidence</dt>
              <dd>Explicitly synthetic or intake-observed</dd>
            </div>
            <div>
              <dt>Google Docs</dt>
              <dd>Not published</dd>
            </div>
          </dl>
          <button
            type="button"
            className="button button-secondary"
            disabled={!activeProject.is_synthetic_demo || running}
            onClick={onFixture}
          >
            Run synthetic demonstration
          </button>
          {!activeProject.is_synthetic_demo ? (
            <small>
              Open the synthetic demonstration project from the dashboard to use
              this executor.
            </small>
          ) : null}
        </article>
      </div>

      {message ? (
        <p className="inline-message" role="status">
          {message}
        </p>
      ) : null}

      {!preflight.passed ? (
        <div className="blocking-banner">
          <div>
            <p className="eyebrow">Run blocked</p>
            <h2>{preflight.issues.length} required intake gaps remain</h2>
          </div>
          <button
            type="button"
            className="button button-primary"
            onClick={() => setView("preflight")}
          >
            Review preflight
          </button>
        </div>
      ) : null}

      <div className="section-heading">
        <div>
          <p className="eyebrow">Intelligence lanes</p>
          <h2>{manifest ? "Latest run state" : "Planned state"}</h2>
        </div>
        <p>
          {manifest
            ? `${manifest.mode === "deterministic_fixture" ? "Synthetic fixture" : "Local Codex"} · ${manifest.state}`
            : "No run manifest yet."}
        </p>
      </div>

      {manifest?.synthetic ? (
        <div className="synthetic-banner">
          <strong>{manifest.synthetic_label}</strong>
          <span>
            Do not use these records, findings, or outputs for a real market
            decision.
          </span>
        </div>
      ) : null}

      <div className="lane-grid">
        {(manifest?.lanes ?? []).length ? (
          manifest!.lanes.map((lane) => (
            <article className={`lane-card lane-${lane.state}`} key={lane.id}>
              <div>
                <p className="eyebrow">{lane.id.replaceAll("_", " ")}</p>
                <h3>{lane.title}</h3>
              </div>
              <StatusPill state={lane.state} />
              <p>{lane.evidence_summary}</p>
              <div className="lane-blocker">
                <span>Blocker</span>
                <strong>{lane.blocker ?? "None recorded"}</strong>
              </div>
              <small>
                Updated{" "}
                {lane.last_updated
                  ? new Date(lane.last_updated).toLocaleString()
                  : "not yet"}
              </small>
            </article>
          ))
        ) : (
          <div className="empty-state empty-state-wide">
            <span>11</span>
            <div>
              <h3>Eleven independent lanes are ready to model</h3>
              <p>
                Run the canonical local skill or the visibly synthetic fixture to
                populate evidence, blocker, update, and artifact state.
              </p>
            </div>
          </div>
        )}
      </div>

      {manifest ? (
        <div className="review-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setView("evidence")}
          >
            Review evidence
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => setView("deliverables")}
          >
            Review outputs
          </button>
        </div>
      ) : null}
    </section>
  );
}
