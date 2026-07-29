"use client";

import { useState } from "react";
import { ANSWER_STATES, type AnswerState } from "@/lib/contracts/types";
import {
  fromList,
  getAtPath,
  humanize,
  toList,
} from "@/lib/contracts/path";
import { useWorkspace } from "@/lib/workspace/store";
import { containsSecretMaterial } from "@/lib/contracts/secrets";

const SENTINELS = new Set(["unknown", "research_this", "not_applicable"]);

interface QuestionFieldProps {
  path: string;
  label: string;
  help: string;
  kind?: "text" | "textarea" | "list" | "select" | "date" | "number";
  options?: ReadonlyArray<{ value: string; label: string }>;
  placeholder?: string;
  required?: boolean;
}

function inferState(value: unknown, explicit?: AnswerState): AnswerState {
  if (explicit) return explicit;
  if (Array.isArray(value)) return value.length ? "known" : "blank";
  if (typeof value === "string" && SENTINELS.has(value)) {
    return value as AnswerState;
  }
  return value === "" || value === null || value === undefined ? "blank" : "known";
}

export function QuestionField({
  path,
  label,
  help,
  kind = "text",
  options = [],
  placeholder,
  required = false,
}: QuestionFieldProps) {
  const { activeProject, updateField, updateFieldState } = useWorkspace();
  const [safetyMessage, setSafetyMessage] = useState<string | null>(null);
  if (!activeProject) return null;

  const value = getAtPath(activeProject.intake, path);
  const state = inferState(value, activeProject.field_states[path]);
  const inputValue =
    kind === "list"
      ? fromList(value)
      : typeof value === "string"
        ? SENTINELS.has(value)
          ? activeProject.raw_answers[path] ?? ""
          : value
        : value === null || value === undefined
          ? ""
          : String(value);

  const onValue = (next: string) => {
    if (containsSecretMaterial(next)) {
      setSafetyMessage(
        "Credential-like values and signed URLs are not stored in this workbench.",
      );
      return;
    }
    setSafetyMessage(null);
    updateField(
      path,
      kind === "list"
        ? toList(next)
        : kind === "number"
          ? next === ""
            ? 0
            : Number(next)
          : next,
      next,
    );
  };

  return (
    <div className={`question-field question-${state}`}>
      <div className="question-heading">
        <div>
          <label htmlFor={`field-${path}`}>
            {label}
            {required ? <span aria-label="required"> *</span> : null}
          </label>
          <p>{help}</p>
        </div>
        <select
          aria-label={`${label} answer state`}
          className="answer-state"
          value={state}
          onChange={(event) =>
            updateFieldState(path, event.target.value as AnswerState)
          }
        >
          {ANSWER_STATES.map((answerState) => (
            <option key={answerState} value={answerState}>
              {answerState === "blank"
                ? "No answer yet"
                : humanize(answerState)}
            </option>
          ))}
        </select>
      </div>

      {state === "known" ? (
        kind === "textarea" ? (
          <textarea
            id={`field-${path}`}
            value={inputValue}
            rows={4}
            placeholder={placeholder}
            onChange={(event) => onValue(event.target.value)}
          />
        ) : kind === "select" ? (
          <select
            id={`field-${path}`}
            value={inputValue}
            onChange={(event) => onValue(event.target.value)}
          >
            <option value="">Choose one</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={`field-${path}`}
            type={kind === "date" || kind === "number" ? kind : "text"}
            value={inputValue}
            placeholder={placeholder}
            onChange={(event) => onValue(event.target.value)}
          />
        )
      ) : (
        <div className="answer-state-note">
          {state === "research_this"
            ? "This becomes an explicit research question."
            : state === "unknown"
              ? "This remains visible as an unresolved input."
              : state === "not_applicable"
                ? "This is intentionally excluded from the brief."
                : "Choose an answer state or add what you know."}
        </div>
      )}
      {safetyMessage ? (
        <p className="field-safety-message" role="alert">
          {safetyMessage}
        </p>
      ) : null}
    </div>
  );
}

export function CheckField({
  path,
  label,
  help,
}: {
  path: string;
  label: string;
  help: string;
}) {
  const { activeProject, updateField } = useWorkspace();
  if (!activeProject) return null;
  const checked = Boolean(getAtPath(activeProject.intake, path));
  return (
    <label className="check-field">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => updateField(path, event.target.checked)}
      />
      <span>
        <strong>{label}</strong>
        <small>{help}</small>
      </span>
    </label>
  );
}
