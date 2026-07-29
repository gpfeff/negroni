"use client";

import { useMemo, useState } from "react";
import { StatusPill } from "@/components/ui/status-pill";
import {
  createDocumentContract,
  SUPPORTING_OUTPUT_CONTRACT,
} from "@/lib/contracts/defaults";
import { downloadText } from "@/lib/contracts/download";
import { humanize } from "@/lib/contracts/path";
import type { ArtifactRecord } from "@/lib/contracts/types";
import { useWorkspace } from "@/lib/workspace/store";

const NO_ARTIFACTS: ArtifactRecord[] = [];

export function DeliverablesView() {
  const { activeProject, setView } = useWorkspace();
  const manifest = activeProject?.run_manifest;
  const documents = manifest?.documents ?? createDocumentContract();
  const artifacts = manifest?.artifacts ?? NO_ARTIFACTS;
  const [selectedId, setSelectedId] = useState<string | null>(
    artifacts[0]?.id ?? null,
  );
  const selected = useMemo(
    () => artifacts.find((artifact) => artifact.id === selectedId) ?? artifacts[0],
    [artifacts, selectedId],
  );

  if (!activeProject) return null;

  return (
    <section className="view-stack" aria-labelledby="deliverables-title">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Deliverables</p>
          <h1 id="deliverables-title">Portable Markdown, verified native parity</h1>
        </div>
        <p>
          A Google Doc URL alone is not publication proof. Access and content
          parity remain unverified until native readback passes.
        </p>
      </div>

      {manifest?.synthetic ? (
        <div className="synthetic-banner">
          <strong>{manifest.synthetic_label}</strong>
          <span>Google Docs are never faked with IDs or URLs.</span>
        </div>
      ) : null}

      <div className="delivery-summary-grid">
        <article>
          <p className="eyebrow">Markdown</p>
          <strong>
            {documents.filter((document) =>
              ["generated", "fixture_preview"].includes(document.markdown_state),
            ).length}
            /10
          </strong>
          <span>generated or previewed</span>
        </article>
        <article>
          <p className="eyebrow">Native Google Docs</p>
          <strong>
            {
              documents.filter(
                (document) => document.google_doc_state === "verified",
              ).length
            }
            /10
          </strong>
          <span>read back and verified</span>
        </article>
        <article>
          <p className="eyebrow">Parity</p>
          <strong>
            {
              documents.filter((document) => document.parity_state === "matched")
                .length
            }
            /10
          </strong>
          <span>matched</span>
        </article>
        <article className="delivery-manifest-state">
          <p className="eyebrow">document-manifest.json</p>
          <strong>Not created</strong>
          <span>Correct until native documents are checked</span>
        </article>
      </div>

      <div className="manifest-callout">
        <div>
          <p className="eyebrow">App-owned run contract</p>
          <h2>run-manifest.json</h2>
          <p>
            Stores adapter, skill digest, lane states, blockers, artifacts,
            evidence coverage, and limitations. It does not replace the canonical
            document or capture manifests.
          </p>
        </div>
        <button
          type="button"
          className="button button-secondary"
          disabled={!manifest}
          onClick={() =>
            manifest &&
            downloadText(
              "run-manifest.json",
              `${JSON.stringify(manifest, null, 2)}\n`,
              "application/json;charset=utf-8",
            )
          }
        >
          Export run manifest
        </button>
      </div>

      <div
        className="document-contract"
        tabIndex={0}
        aria-label="Numbered document delivery contract"
      >
        <div className="document-contract-header">
          <span>Section</span>
          <span>Markdown</span>
          <span>Google Doc</span>
          <span>Parity</span>
        </div>
        {documents.map((document) => {
          const artifact = artifacts.find(
            (candidate) => candidate.section_id === document.section_id,
          );
          return (
            <div className="document-contract-row" key={document.section_id}>
              <div>
                <span className="section-number">{document.section_id}</span>
                <div>
                  <strong>{document.title}</strong>
                  <code>{document.markdown_path}</code>
                  <small>{document.limitation}</small>
                </div>
              </div>
              <StatusPill state={document.markdown_state} />
              <StatusPill state={document.google_doc_state} />
              <StatusPill state={document.parity_state} />
              {artifact ? (
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => setSelectedId(artifact.id)}
                >
                  Preview
                </button>
              ) : (
                <span className="row-empty">No artifact</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="supporting-contract">
        <div>
          <p className="eyebrow">Supporting output contract</p>
          <h2>Created only when evidence exists</h2>
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

      {selected ? (
        <div className="artifact-workspace">
          <div className="artifact-sidebar">
            <p className="eyebrow">Available artifacts</p>
            {artifacts.map((artifact) => (
              <button
                type="button"
                key={artifact.id}
                className={artifact.id === selected.id ? "artifact-active" : ""}
                onClick={() => setSelectedId(artifact.id)}
              >
                <span>{artifact.section_id}</span>
                <strong>{artifact.title}</strong>
                <small>{humanize(artifact.state)}</small>
              </button>
            ))}
          </div>
          <article className="artifact-preview">
            <div className="artifact-preview-heading">
              <div>
                <p className="eyebrow">{selected.markdown_path}</p>
                <h2>{selected.title}</h2>
              </div>
              <button
                type="button"
                className="button button-secondary"
                onClick={() =>
                  downloadText(selected.markdown_path, selected.markdown)
                }
              >
                Download Markdown
              </button>
            </div>
            {selected.limitation ? (
              <div className="evidence-limitation">
                <span>Limitation</span>
                <strong>{selected.limitation}</strong>
              </div>
            ) : null}
            <pre tabIndex={0} aria-label={`${selected.title} Markdown preview`}>
              {selected.markdown}
            </pre>
          </article>
        </div>
      ) : (
        <div className="empty-state empty-state-wide">
          <span>M</span>
          <div>
            <h3>No Markdown artifacts exist yet</h3>
            <p>
              The contract is visible, but empty files are not created to simulate
              completion.
            </p>
            <button
              type="button"
              className="button button-primary"
              onClick={() => setView("run")}
            >
              Open run workspace
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
