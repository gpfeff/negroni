"use client";

import { useEffect } from "react";
import { DashboardView } from "./views/dashboard-view";
import { DeliverablesView } from "./views/deliverables-view";
import { EvidenceView } from "./views/evidence-view";
import { IntakeView } from "./views/intake-view";
import { PreflightView } from "./views/preflight-view";
import { RunView } from "./views/run-view";
import { SourcesView } from "./views/sources-view";
import {
  useWorkspace,
  type WorkspaceView,
} from "@/lib/workspace/store";
import { StatusPill } from "@/components/ui/status-pill";

const NAV_ITEMS: Array<{
  id: WorkspaceView;
  code: string;
  label: string;
}> = [
  { id: "dashboard", code: "00", label: "Projects" },
  { id: "intake", code: "01", label: "Intake" },
  { id: "sources", code: "02", label: "Sources" },
  { id: "preflight", code: "03", label: "Preflight" },
  { id: "run", code: "04", label: "Run" },
  { id: "evidence", code: "05", label: "Evidence" },
  { id: "deliverables", code: "06", label: "Deliverables" },
];

function CurrentView() {
  const { view } = useWorkspace();
  switch (view) {
    case "dashboard":
      return <DashboardView />;
    case "intake":
      return <IntakeView />;
    case "sources":
      return <SourcesView />;
    case "preflight":
      return <PreflightView />;
    case "run":
      return <RunView />;
    case "evidence":
      return <EvidenceView />;
    case "deliverables":
      return <DeliverablesView />;
  }
}

export function WorkspaceApp() {
  const { hydrated, view, setView, activeProject, createProject } = useWorkspace();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [view]);

  if (!hydrated) {
    return (
      <main className="loading-stage" aria-live="polite">
        <span className="loading-rule" />
        <p>Opening the device-local workbench…</p>
      </main>
    );
  }

  return (
    <div className="app-frame">
      <header className="topbar">
        <button
          type="button"
          className="wordmark"
          onClick={() => setView("dashboard")}
          aria-label="Open project dashboard"
        >
          <span className="wordmark-mark">LI</span>
          <span>
            Lead Intelligence
            <small>Evidence workbench</small>
          </span>
        </button>
        <div className="topbar-project">
          {activeProject ? (
            <>
              <span className="topbar-project-name">
                {activeProject.intake.project.name || "Untitled project"}
              </span>
              <StatusPill state={activeProject.state} />
            </>
          ) : null}
        </div>
        <button type="button" className="button button-primary" onClick={createProject}>
          New project
        </button>
      </header>

      <aside className="sidebar" aria-label="Workspace navigation">
        <div className="sidebar-rule" aria-hidden="true">
          <span>BUYER</span>
          <i />
          <span>CONSUMER</span>
        </div>
        <nav>
          {NAV_ITEMS.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`nav-item ${view === item.id ? "nav-item-active" : ""}`}
              onClick={() => setView(item.id)}
              aria-current={view === item.id ? "page" : undefined}
            >
              <span>{item.code}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <strong>External actions</strong>
          <span>None by default</span>
        </div>
      </aside>

      <main className="workspace-main">
        <CurrentView />
      </main>
    </div>
  );
}
