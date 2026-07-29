"use client";

import { StatusPill } from "@/components/ui/status-pill";
import { TwoSidedBand } from "@/components/ui/two-sided-band";
import { validateIntake } from "@/lib/contracts/preflight";
import { useWorkspace } from "@/lib/workspace/store";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function DashboardView() {
  const {
    projects,
    createProject,
    openProject,
    duplicateProject,
  } = useWorkspace();

  return (
    <section className="view-stack" aria-labelledby="dashboard-title">
      <div className="view-hero dashboard-hero">
        <div>
          <p className="eyebrow">Project dashboard</p>
          <h1 id="dashboard-title">
            Research decisions with every unknown still visible.
          </h1>
          <p className="lede">
            Build the buyer side, the end-customer side, and the lead product
            between them—without turning missing evidence into false certainty.
          </p>
        </div>
        <button type="button" className="button button-primary" onClick={createProject}>
          Create a project
        </button>
      </div>

      <TwoSidedBand />

      <div className="section-heading">
        <div>
          <p className="eyebrow">Saved locally on this device</p>
          <h2>{projects.length} project{projects.length === 1 ? "" : "s"}</h2>
        </div>
        <p>
          Hosted previews contain only the visible synthetic demonstration.
        </p>
      </div>

      <div className="project-grid">
        {projects.map((project) => {
          const preflight = validateIntake(project.intake, project.field_states);
          const completedLanes =
            project.run_manifest?.lanes.filter((lane) => lane.state === "complete")
              .length ?? 0;
          return (
            <article
              className={`project-card ${project.is_synthetic_demo ? "project-card-synthetic" : ""}`}
              key={project.id}
            >
              <div className="project-card-topline">
                <StatusPill state={project.state} />
                {project.is_synthetic_demo ? (
                  <span className="synthetic-tag">Synthetic demonstration</span>
                ) : null}
              </div>
              <h3>{project.intake.project.name || "Untitled project"}</h3>
              <p className="project-market">
                {project.intake.market.industry || "Market not defined"} ·{" "}
                {[
                  ...project.intake.market.countries,
                  ...project.intake.market.regions,
                ].join(", ") || "Geography not defined"}
              </p>
              <div className="project-sides">
                <div>
                  <span>Lead buyer</span>
                  <strong>
                    {project.intake.b2b_lead_buyers.organization_types.join(", ") ||
                      project.intake.b2b_lead_buyers.buyer_relationship ||
                      "Not defined"}
                  </strong>
                </div>
                <i aria-hidden="true" />
                <div>
                  <span>Lead consumer</span>
                  <strong>
                    {project.intake.b2c_lead_consumers.segment_definition ||
                      "Not defined"}
                  </strong>
                </div>
              </div>

              <dl className="project-facts">
                <div>
                  <dt>Model</dt>
                  <dd>
                    {project.intake.business_model.acquisition_model ||
                      "Not selected"}
                  </dd>
                </div>
                <div>
                  <dt>Conversion</dt>
                  <dd>
                    {project.intake.business_model.conversion_unit ||
                      "Not selected"}
                  </dd>
                </div>
                <div>
                  <dt>Profile</dt>
                  <dd>{project.intake.project.research_profile}</dd>
                </div>
                <div>
                  <dt>Lane coverage</dt>
                  <dd>
                    {project.run_manifest
                      ? `${completedLanes} complete; states remain independent`
                      : preflight.passed
                        ? "Ready to plan"
                        : `${preflight.issues.length} intake gap${preflight.issues.length === 1 ? "" : "s"}`}
                  </dd>
                </div>
              </dl>

              <div className="project-blocker">
                <span>Current blocker</span>
                <strong>
                  {project.current_blocker ||
                    (preflight.launch_gates[0] ?? "No research blocker")}
                </strong>
              </div>

              {project.run_manifest ? (
                <div className="project-lane-coverage" aria-label="Lane coverage">
                  {project.run_manifest.lanes.map((lane, index) => (
                    <span
                      key={lane.id}
                      className={`project-lane-dot project-lane-${lane.state}`}
                      title={`${lane.title}: ${lane.state.replaceAll("_", " ")}`}
                    >
                      {String(index).padStart(2, "0")}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="project-no-run">No lane run recorded.</p>
              )}

              <div className="project-card-footer">
                <span>Updated {formatDate(project.updated_at)}</span>
                <div>
                  <button
                    type="button"
                    className="button button-quiet"
                    onClick={() => duplicateProject(project.id)}
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => openProject(project.id, "intake")}
                  >
                    Open
                  </button>
                </div>
              </div>

              <div className="project-shortcuts">
                <button
                  type="button"
                  onClick={() => openProject(project.id, "sources")}
                >
                  Sources
                </button>
                <button
                  type="button"
                  onClick={() => openProject(project.id, "deliverables")}
                >
                  Deliverables
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
