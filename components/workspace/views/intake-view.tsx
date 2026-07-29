"use client";

import { IntakeWizard } from "@/components/intake/intake-wizard";
import { useWorkspace } from "@/lib/workspace/store";

export function IntakeView() {
  const { activeProject } = useWorkspace();
  return (
    <section className="view-stack" aria-labelledby="intake-title">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Guided intake</p>
          <h1 id="intake-title">
            {activeProject?.intake.project.name || "Untitled project"}
          </h1>
        </div>
        <p>
          Saved automatically on this device. Unknown, not applicable, and
          research this are different answers.
        </p>
      </div>
      <IntakeWizard />
    </section>
  );
}
