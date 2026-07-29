"use client";

import { useMemo, useState } from "react";
import { StatusPill } from "@/components/ui/status-pill";
import { humanize } from "@/lib/contracts/path";
import type { EvidenceRecord } from "@/lib/contracts/types";
import { useWorkspace } from "@/lib/workspace/store";

const NO_EVIDENCE: EvidenceRecord[] = [];

type FilterKey =
  | "audience_side"
  | "speaker_role"
  | "source_type"
  | "platform"
  | "principal"
  | "represented_date"
  | "geography"
  | "evidence_class";

const FILTER_LABELS: Record<FilterKey, string> = {
  audience_side: "Audience side",
  speaker_role: "Speaker role",
  source_type: "Source type",
  platform: "Platform",
  principal: "Principal",
  represented_date: "Date",
  geography: "Geography",
  evidence_class: "Evidence class",
};

export function EvidenceView() {
  const { activeProject, setView } = useWorkspace();
  const [filters, setFilters] = useState<Record<FilterKey, string>>({
    audience_side: "",
    speaker_role: "",
    source_type: "",
    platform: "",
    principal: "",
    represented_date: "",
    geography: "",
    evidence_class: "",
  });
  const manifest = activeProject?.run_manifest;
  const evidence = manifest?.evidence ?? NO_EVIDENCE;

  const options = useMemo(() => {
    return (Object.keys(FILTER_LABELS) as FilterKey[]).reduce<
      Record<FilterKey, string[]>
    >(
      (result, key) => {
        result[key] = [
          ...new Set(evidence.map((record) => String(record[key])).filter(Boolean)),
        ].sort();
        return result;
      },
      {
        audience_side: [],
        speaker_role: [],
        source_type: [],
        platform: [],
        principal: [],
        represented_date: [],
        geography: [],
        evidence_class: [],
      },
    );
  }, [evidence]);

  const filtered = evidence.filter((record) =>
    (Object.keys(filters) as FilterKey[]).every(
      (key) => !filters[key] || String(record[key]) === filters[key],
    ),
  );

  return (
    <section className="view-stack" aria-labelledby="evidence-title">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Evidence & findings</p>
          <h1 id="evidence-title">Claims stay attached to context</h1>
        </div>
        <p>
          Evidence class, speaker role, represented geography, and limitations
          remain visible near every conclusion.
        </p>
      </div>

      {manifest?.synthetic ? (
        <div className="synthetic-banner">
          <strong>{manifest.synthetic_label}</strong>
          <span>
            Observed means observed from the invented intake—not observed in a
            real market.
          </span>
        </div>
      ) : null}

      {!manifest ? (
        <div className="empty-state empty-state-wide">
          <span>E</span>
          <div>
            <h3>No evidence manifest exists</h3>
            <p>
              Start a local run or open the synthetic demonstration. The
              workbench does not fabricate an empty market into findings.
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
      ) : (
        <>
          <div className="filter-panel" aria-label="Evidence filters">
            {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => (
              <label key={key}>
                {FILTER_LABELS[key]}
                <select
                  value={filters[key]}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                >
                  <option value="">All</option>
                  {options[key].map((value) => (
                    <option value={value} key={value}>
                      {humanize(value)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <button
              type="button"
              className="button button-quiet"
              onClick={() =>
                setFilters({
                  audience_side: "",
                  speaker_role: "",
                  source_type: "",
                  platform: "",
                  principal: "",
                  represented_date: "",
                  geography: "",
                  evidence_class: "",
                })
              }
            >
              Clear filters
            </button>
          </div>

          <div className="section-heading">
            <div>
              <p className="eyebrow">Evidence ledger</p>
              <h2>
                {filtered.length} of {evidence.length} records
              </h2>
            </div>
            <p>Sample counts are not population prevalence.</p>
          </div>

          <div className="evidence-list">
            {filtered.map((record) => (
              <article
                className={`evidence-card evidence-${record.audience_side}`}
                key={record.evidence_id}
              >
                <div className="evidence-spine">
                  <code>{record.evidence_id}</code>
                  <span>{humanize(record.audience_side)}</span>
                </div>
                <div className="evidence-body">
                  <div className="evidence-heading">
                    <StatusPill state={record.evidence_class} />
                    <span>
                      {humanize(record.speaker_role)} ·{" "}
                      {humanize(record.source_type)}
                    </span>
                  </div>
                  <h3>{record.claim_or_record}</h3>
                  <blockquote>{record.excerpt_or_fields}</blockquote>
                  <dl>
                    <div>
                      <dt>Principal</dt>
                      <dd>{record.principal || "Unknown"}</dd>
                    </div>
                    <div>
                      <dt>Platform</dt>
                      <dd>{record.platform || "Not applicable"}</dd>
                    </div>
                    <div>
                      <dt>Date</dt>
                      <dd>{record.represented_date || "Unknown"}</dd>
                    </div>
                    <div>
                      <dt>Geography</dt>
                      <dd>{record.geography || "Unknown"}</dd>
                    </div>
                  </dl>
                  <div className="evidence-limitation">
                    <span>Limitation</span>
                    <strong>{record.limitation}</strong>
                  </div>
                  <small>{record.url_or_path}</small>
                </div>
              </article>
            ))}
          </div>

          <div className="section-heading">
            <div>
              <p className="eyebrow">Material findings</p>
              <h2>{manifest.findings.length} review items</h2>
            </div>
            <p>Every item carries evidence IDs and a limitation.</p>
          </div>

          <div className="finding-grid">
            {manifest.findings.map((finding) => (
              <article
                className={`finding-card finding-${finding.audience_side}`}
                key={finding.id}
              >
                <div className="finding-topline">
                  <StatusPill state={finding.evidence_class} />
                  <code>{finding.id}</code>
                </div>
                <h3>{finding.title}</h3>
                <p>{finding.statement}</p>
                <div className="evidence-ids">
                  {finding.evidence_ids.map((id) => (
                    <span key={id}>{id}</span>
                  ))}
                </div>
                <div className="evidence-limitation">
                  <span>Limitation</span>
                  <strong>{finding.limitation}</strong>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
