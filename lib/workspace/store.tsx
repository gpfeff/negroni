"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createBlankProject } from "@/lib/contracts/defaults";
import { importProjectJson } from "@/lib/contracts/serialization";
import { validateIntake } from "@/lib/contracts/preflight";
import {
  assertNoSecretMaterial,
  containsSecretMaterial,
} from "@/lib/contracts/secrets";
import { setAtPath, toList } from "@/lib/contracts/path";
import { transitionProject } from "@/lib/contracts/state-machine";
import type {
  AnswerState,
  ProjectRecord,
  RunManifest,
  SourceReference,
} from "@/lib/contracts/types";
import {
  createSyntheticProject,
  executeDeterministicFixture,
} from "@/lib/runtime/fixture";

const STORAGE_KEY = "lead-intelligence-workbench:v1";

export type WorkspaceView =
  | "dashboard"
  | "intake"
  | "sources"
  | "preflight"
  | "run"
  | "evidence"
  | "deliverables";

interface WorkspaceContextValue {
  hydrated: boolean;
  projects: ProjectRecord[];
  activeProject: ProjectRecord | null;
  view: WorkspaceView;
  setView(view: WorkspaceView): void;
  openProject(id: string, view?: WorkspaceView): void;
  createProject(): void;
  duplicateProject(id: string): void;
  importProject(json: string): ProjectRecord;
  updateField(path: string, value: unknown, raw?: string): void;
  updateFieldState(path: string, state: AnswerState): void;
  addSource(source: SourceReference): void;
  updateSource(source: SourceReference): void;
  executeFixture(): void;
  applyRunManifest(manifest: RunManifest): void;
  markResearching(): void;
  markRunFailed(message: string): void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function initialProjects(): ProjectRecord[] {
  return [createSyntheticProject()];
}

function projectNameForCopy(project: ProjectRecord): string {
  return `${project.intake.project.name || "Untitled project"} — copy`;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [projects, setProjects] = useState<ProjectRecord[]>(initialProjects);
  const [activeId, setActiveId] = useState<string>("synthetic-community-workshop");
  const [view, setView] = useState<WorkspaceView>("dashboard");

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as {
            projects?: ProjectRecord[];
            activeId?: string;
          };
          if (
            Array.isArray(parsed.projects) &&
            parsed.projects.length > 0 &&
            !containsSecretMaterial(parsed.projects)
          ) {
            setProjects(parsed.projects);
            setActiveId(parsed.activeId ?? parsed.projects[0].id);
          } else if (containsSecretMaterial(parsed.projects)) {
            localStorage.removeItem(STORAGE_KEY);
          }
        }
      } catch {
        // A corrupt device-local cache should not prevent opening the fixture.
      } finally {
        setHydrated(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (containsSecretMaterial(projects)) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ projects, activeId }));
  }, [projects, activeId, hydrated]);

  const activeProject =
    projects.find((project) => project.id === activeId) ?? projects[0] ?? null;

  const replaceActive = useCallback(
    (updater: (project: ProjectRecord) => ProjectRecord) => {
      setProjects((current) =>
        current.map((project) =>
          project.id === activeId ? updater(project) : project,
        ),
      );
    },
    [activeId],
  );

  const openProject = useCallback(
    (id: string, nextView: WorkspaceView = "intake") => {
      setActiveId(id);
      setView(nextView);
    },
    [],
  );

  const createProject = useCallback(() => {
    const project = createBlankProject();
    setProjects((current) => [project, ...current]);
    setActiveId(project.id);
    setView("intake");
  }, []);

  const duplicateProject = useCallback((id: string) => {
    setProjects((current) => {
      const source = current.find((project) => project.id === id);
      if (!source) return current;
      const now = new Date().toISOString();
      const copy = structuredClone(source);
      copy.id = globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}`;
      copy.created_at = now;
      copy.updated_at = now;
      copy.intake.project.name = projectNameForCopy(source);
      copy.run_manifest = null;
      copy.is_synthetic_demo = false;
      copy.state = validateIntake(copy.intake, copy.field_states).passed
        ? "ready"
        : "draft";
      copy.current_blocker =
        copy.state === "ready" ? null : "Minimum brief is incomplete.";
      setActiveId(copy.id);
      setView("intake");
      return [copy, ...current];
    });
  }, []);

  const importProject = useCallback((json: string) => {
    const project = importProjectJson(json);
    setProjects((current) => [project, ...current]);
    setActiveId(project.id);
    setView("preflight");
    return project;
  }, []);

  const updateField = useCallback(
    (path: string, value: unknown, raw?: string) => {
      assertNoSecretMaterial(value, `The ${path} answer`);
      if (raw !== undefined) {
      assertNoSecretMaterial(raw, `The ${path} raw answer`);
      }
      replaceActive((project) => {
        if (project.state === "researching") return project;
        const now = new Date().toISOString();
        const intake = setAtPath(project.intake, path, value);
        const fieldStates = {
          ...project.field_states,
          [path]:
            value === "" || (Array.isArray(value) && value.length === 0)
              ? ("blank" as const)
              : ("known" as const),
        };
        const preflight = validateIntake(intake, fieldStates);
        const nextState = preflight.passed ? "ready" : "draft";
        return {
          ...project,
          intake,
          field_states: fieldStates,
          raw_answers:
            raw === undefined
              ? project.raw_answers
              : { ...project.raw_answers, [path]: raw },
          updated_at: now,
          run_manifest: null,
          state: transitionProject(project.state, nextState),
          current_blocker: project.run_manifest
            ? "Intake changed; the prior run was cleared."
            : preflight.passed
              ? null
              : "Minimum brief is incomplete.",
        };
      });
    },
    [replaceActive],
  );

  const updateFieldState = useCallback(
    (path: string, state: AnswerState) => {
      replaceActive((project) => {
        if (project.state === "researching") return project;
        const currentValue = path.split(".").reduce<unknown>((value, key) => {
          if (value && typeof value === "object") {
            return (value as Record<string, unknown>)[key];
          }
          return undefined;
        }, project.intake);
        const value =
          state === "known"
            ? Array.isArray(currentValue)
              ? toList(project.raw_answers[path] ?? "")
              : typeof currentValue === "number"
                ? Number(project.raw_answers[path] ?? currentValue)
              : typeof currentValue === "string" &&
                  ["unknown", "research_this", "not_applicable"].includes(
                    currentValue,
                  )
                ? project.raw_answers[path] ?? ""
                : currentValue
            : Array.isArray(currentValue)
              ? []
              : typeof currentValue === "number"
                ? 0
              : state === "blank"
                ? ""
                : state;
        const intake = setAtPath(project.intake, path, value);
        const fieldStates = { ...project.field_states, [path]: state };
        const preflight = validateIntake(intake, fieldStates);
        const nextState = preflight.passed ? "ready" : "draft";
        return {
          ...project,
          intake,
          field_states: fieldStates,
          updated_at: new Date().toISOString(),
          run_manifest: null,
          state: transitionProject(project.state, nextState),
          current_blocker: project.run_manifest
            ? "Intake changed; the prior run was cleared."
            : preflight.passed
              ? null
              : "Minimum brief is incomplete.",
        };
      });
    },
    [replaceActive],
  );

  const addSource = useCallback(
    (source: SourceReference) => {
      const path =
        source.kind === "local_file"
          ? "sources.attachments"
          : "sources.urls";
      replaceActive((project) => {
        if (project.state === "researching") return project;
        const current =
          source.kind === "local_file"
            ? project.intake.sources.attachments
            : project.intake.sources.urls;
        const intake = setAtPath(project.intake, path, [...current, source]);
        const preflight = validateIntake(intake, project.field_states);
        const nextState = preflight.passed ? "ready" : "draft";
        return {
          ...project,
          intake,
          run_manifest: null,
          updated_at: new Date().toISOString(),
          state: transitionProject(project.state, nextState),
          current_blocker: project.run_manifest
            ? "Sources changed; the prior run was cleared."
            : preflight.passed
              ? null
              : "Minimum brief is incomplete.",
        };
      });
    },
    [replaceActive],
  );

  const updateSource = useCallback(
    (source: SourceReference) => {
      replaceActive((project) => {
        if (project.state === "researching") return project;
        const intake = structuredClone(project.intake);
        const group =
          source.kind === "local_file"
            ? intake.sources.attachments
            : intake.sources.urls;
        const index = group.findIndex((candidate) => candidate.id === source.id);
        if (index >= 0) group[index] = source;
        const preflight = validateIntake(intake, project.field_states);
        const nextState = preflight.passed ? "ready" : "draft";
        return {
          ...project,
          intake,
          run_manifest: null,
          updated_at: new Date().toISOString(),
          state: transitionProject(project.state, nextState),
          current_blocker: project.run_manifest
            ? "Sources changed; the prior run was cleared."
            : preflight.passed
              ? null
              : "Minimum brief is incomplete.",
        };
      });
    },
    [replaceActive],
  );

  const executeFixture = useCallback(() => {
    replaceActive((project) => {
      const manifest = executeDeterministicFixture(project);
      return {
        ...project,
        run_manifest: manifest,
        state: transitionProject(
          transitionProject(project.state, "researching"),
          manifest.state,
        ),
        updated_at: manifest.completed_at ?? new Date().toISOString(),
        current_blocker: manifest.blockers[0] ?? null,
      };
    });
    setView("run");
  }, [replaceActive]);

  const applyRunManifest = useCallback(
    (manifest: RunManifest) => {
      replaceActive((project) => ({
        ...project,
        run_manifest: manifest,
        state: transitionProject(project.state, manifest.state),
        updated_at: manifest.completed_at ?? new Date().toISOString(),
        current_blocker: manifest.blockers[0] ?? null,
      }));
    },
    [replaceActive],
  );

  const markResearching = useCallback(() => {
    replaceActive((project) => ({
      ...project,
      state: transitionProject(project.state, "researching"),
      current_blocker: null,
      updated_at: new Date().toISOString(),
    }));
  }, [replaceActive]);

  const markRunFailed = useCallback(
    (message: string) => {
      replaceActive((project) => ({
        ...project,
        state: transitionProject(project.state, "failed"),
        current_blocker: message,
        updated_at: new Date().toISOString(),
      }));
    },
    [replaceActive],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      hydrated,
      projects,
      activeProject,
      view,
      setView,
      openProject,
      createProject,
      duplicateProject,
      importProject,
      updateField,
      updateFieldState,
      addSource,
      updateSource,
      executeFixture,
      applyRunManifest,
      markResearching,
      markRunFailed,
    }),
    [
      activeProject,
      addSource,
      applyRunManifest,
      createProject,
      duplicateProject,
      executeFixture,
      hydrated,
      importProject,
      markResearching,
      markRunFailed,
      openProject,
      projects,
      updateField,
      updateFieldState,
      updateSource,
      view,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider.");
  return value;
}
