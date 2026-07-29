import type { ProjectRecord, RunManifest } from "@/lib/contracts/types";
import { generateProjectBrief } from "@/lib/contracts/brief";

export interface RuntimeCapability {
  available: boolean;
  mode: "codex_app_server" | "deterministic_fixture";
  label: string;
  detail: string;
  codex_version: string | null;
  skill_available: boolean;
}

export async function detectLocalRuntime(): Promise<RuntimeCapability> {
  if (
    typeof window === "undefined" ||
    !["localhost", "127.0.0.1"].includes(window.location.hostname)
  ) {
    return {
      available: false,
      mode: "codex_app_server",
      label: "Local Codex runtime",
      detail:
        "Unavailable in the hosted preview. Use the synthetic fixture or run the local companion.",
      codex_version: null,
      skill_available: false,
    };
  }

  try {
    const response = await fetch("http://127.0.0.1:4317/health", {
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) throw new Error(`Health returned ${response.status}`);
    return (await response.json()) as RuntimeCapability;
  } catch {
    return {
      available: false,
      mode: "codex_app_server",
      label: "Local Codex runtime",
      detail:
        "Companion is not running. The deterministic fixture remains available.",
      codex_version: null,
      skill_available: false,
    };
  }
}

export async function executeLocalCodex(
  project: ProjectRecord,
): Promise<RunManifest> {
  const response = await fetch("http://127.0.0.1:4317/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project_id: project.id,
      intake: project.intake,
      field_states: project.field_states,
      raw_answers: project.raw_answers,
      authorized_sources: [
        ...project.intake.sources.attachments,
        ...project.intake.sources.urls,
      ],
      expected_artifacts: project.run_manifest?.documents ?? null,
      external_actions_allowed:
        project.intake.constraints.external_actions_allowed,
      deterministic_project_brief: generateProjectBrief(
        project.intake,
        project.field_states,
        project.updated_at.slice(0, 10),
      ),
    }),
  });
  const result = (await response.json()) as RunManifest | { error: string };
  if (!response.ok || "error" in result) {
    throw new Error("error" in result ? result.error : "Local run failed.");
  }
  return result;
}
