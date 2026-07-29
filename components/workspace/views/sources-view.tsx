"use client";

import { type FormEvent, useRef, useState } from "react";
import {
  SOURCE_ROLES,
  TEMPLATE_TREATMENTS,
  type SourceRole,
  type TemplateTreatment,
} from "@/lib/contracts/types";
import { humanize } from "@/lib/contracts/path";
import { containsSecretLikeValue } from "@/lib/contracts/secrets";
import { detectLocalFile } from "@/lib/sources/detect";
import {
  createLocalSourceReference,
  createUrlSourceReference,
} from "@/lib/sources/references";
import { useWorkspace } from "@/lib/workspace/store";

export function SourcesView() {
  const { activeProject, addSource, updateSource } = useWorkspace();
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileRole, setFileRole] = useState<SourceRole>("factual_source");
  const [fileTreatment, setFileTreatment] =
    useState<TemplateTreatment>("unassigned");
  const [fileNotes, setFileNotes] = useState("");
  const [urlRole, setUrlRole] = useState<SourceRole>("factual_source");
  const [urlTreatment, setUrlTreatment] =
    useState<TemplateTreatment>("unassigned");
  const [urlNotes, setUrlNotes] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!activeProject) return null;
  const sources = [
    ...activeProject.intake.sources.attachments,
    ...activeProject.intake.sources.urls,
  ];

  const validateNotes = (value: string) => {
    if (containsSecretLikeValue(value)) {
      setMessage("Remove credentials or tokens from source notes before saving.");
      return false;
    }
    return true;
  };

  const onFile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateNotes(fileNotes)) return;
    const file = fileInput.current?.files?.[0];
    if (!file) {
      setMessage("Choose a local file to register.");
      return;
    }
    setBusy(true);
    setMessage("Inspecting the file contents…");
    try {
      const detected = await detectLocalFile(file);
      addSource(
        createLocalSourceReference(
          file,
          detected,
          fileRole,
          fileNotes,
          fileTreatment,
        ),
      );
      if (fileInput.current) fileInput.current.value = "";
      setFileNotes("");
      setMessage(
        `Registered ${file.name} as ${detected}. The file contents were not uploaded or stored.`,
      );
    } catch {
      setMessage("The file could not be inspected. It was not registered.");
    } finally {
      setBusy(false);
    }
  };

  const onUrl = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateNotes(urlNotes)) return;
    try {
      addSource(
        createUrlSourceReference(
          url,
          urlRole,
          urlNotes,
          urlTreatment,
        ),
      );
      setUrl("");
      setUrlNotes("");
      setMessage(
        "URL registered. This MVP does not fetch remote contents during intake.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Enter a valid public HTTP or HTTPS URL.",
      );
    }
  };

  return (
    <section className="view-stack" aria-labelledby="sources-title">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Source workspace</p>
          <h1 id="sources-title">Register evidence by role, not filename</h1>
        </div>
        <p>
          Local files stay on this device. The saved project stores metadata,
          detected type, role, status, and notes—never file bytes or credentials.
          In this MVP, local file contents are not available to the research
          executor.
        </p>
      </div>

      <div className="source-entry-grid">
        <form className="source-entry-card" onSubmit={onFile}>
          <p className="eyebrow">Local file</p>
          <h2>Inspect and register</h2>
          <label>
            Choose a file
            <input ref={fileInput} type="file" />
          </label>
          <label>
            Source role
            <select
              value={fileRole}
              onChange={(event) =>
                setFileRole(event.target.value as SourceRole)
              }
            >
              {SOURCE_ROLES.map((sourceRole) => (
                <option value={sourceRole} key={sourceRole}>
                  {humanize(sourceRole)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Template treatment
            <select
              value={fileTreatment}
              onChange={(event) =>
                setFileTreatment(event.target.value as TemplateTreatment)
              }
            >
              {TEMPLATE_TREATMENTS.map((treatment) => (
                <option value={treatment} key={treatment}>
                  {humanize(treatment)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Notes
            <textarea
              rows={3}
              value={fileNotes}
              onChange={(event) => setFileNotes(event.target.value)}
              placeholder="Why this source belongs in the project"
            />
          </label>
          <button type="submit" className="button button-primary" disabled={busy}>
            {busy ? "Inspecting…" : "Register file"}
          </button>
        </form>

        <form className="source-entry-card" onSubmit={onUrl}>
          <p className="eyebrow">Public URL</p>
          <h2>Register without fetching</h2>
          <label>
            URL
            <input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/source"
            />
          </label>
          <label>
            Source role
            <select
              value={urlRole}
              onChange={(event) => setUrlRole(event.target.value as SourceRole)}
            >
              {SOURCE_ROLES.map((sourceRole) => (
                <option value={sourceRole} key={sourceRole}>
                  {humanize(sourceRole)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Template treatment
            <select
              value={urlTreatment}
              onChange={(event) =>
                setUrlTreatment(event.target.value as TemplateTreatment)
              }
            >
              {TEMPLATE_TREATMENTS.map((treatment) => (
                <option value={treatment} key={treatment}>
                  {humanize(treatment)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Notes
            <textarea
              rows={3}
              value={urlNotes}
              onChange={(event) => setUrlNotes(event.target.value)}
              placeholder="Expected content and intended use"
            />
          </label>
          <button type="submit" className="button button-secondary">
            Register URL
          </button>
        </form>
      </div>

      {message ? (
        <p className="inline-message" role="status">
          {message}
        </p>
      ) : null}

      <div className="section-heading">
        <div>
          <p className="eyebrow">Source inventory</p>
          <h2>
            {sources.length} source{sources.length === 1 ? "" : "s"}
          </h2>
        </div>
        <p>
          Detected type never changes the role. A polished example can still be
          excluded from final facts.
        </p>
      </div>

      {sources.length ? (
        <div className="source-table-wrap">
          <table className="source-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Detected type</th>
                <th>Role</th>
                <th>Template treatment</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr key={source.id}>
                  <td>
                    <strong>{source.name}</strong>
                    <span>
                      {source.kind === "local_file"
                        ? `${source.byte_size?.toLocaleString() ?? 0} bytes · ${source.declared_type}`
                        : source.url}
                    </span>
                  </td>
                  <td>{source.detected_type}</td>
                  <td>
                    <select
                      aria-label={`${source.name} source role`}
                      value={source.role}
                      onChange={(event) =>
                        updateSource({
                          ...source,
                          role: event.target.value as SourceRole,
                        })
                      }
                    >
                      {SOURCE_ROLES.map((sourceRole) => (
                        <option value={sourceRole} key={sourceRole}>
                          {humanize(sourceRole)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      aria-label={`${source.name} template treatment`}
                      value={source.template_treatment ?? "unassigned"}
                      onChange={(event) =>
                        updateSource({
                          ...source,
                          template_treatment: event.target
                            .value as TemplateTreatment,
                        })
                      }
                    >
                      {TEMPLATE_TREATMENTS.map((treatment) => (
                        <option value={treatment} key={treatment}>
                          {humanize(treatment)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      aria-label={`${source.name} source status`}
                      value={source.status}
                      onChange={(event) =>
                        updateSource({
                          ...source,
                          status: event.target
                            .value as typeof source.status,
                        })
                      }
                    >
                      <option value="registered">Registered</option>
                      <option value="available">Available</option>
                      <option value="unavailable">Unavailable</option>
                      <option value="excluded">Excluded</option>
                    </select>
                  </td>
                  <td>
                    <input
                      aria-label={`${source.name} source notes`}
                      value={source.notes}
                      onChange={(event) => {
                        if (!containsSecretLikeValue(event.target.value)) {
                          updateSource({ ...source, notes: event.target.value });
                        }
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <span>0</span>
          <div>
            <h3>No sources registered</h3>
            <p>
              Add a public URL or inspect a local file. An empty source workspace
              is valid during intake but remains a research limitation.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
