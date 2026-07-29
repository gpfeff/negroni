"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ResearchProfile, RunResult } from "@/lib/intelligence/contracts";
import type {
  ResearchMessage,
  ResearchReviewResponse,
  ResearchRevision,
} from "@/lib/review-contracts";

const EMPTY_REVIEW: ResearchReviewResponse = {
  available: false,
  ai_available: false,
  workspace: null,
  revisions: [],
  messages: [],
  blocker: null,
};

type Props = {
  profile: ResearchProfile | null;
  runResult: RunResult | null;
};

function currentRevision(data: ResearchReviewResponse): ResearchRevision | null {
  return data.revisions.find((revision) => revision.id === data.workspace?.current_revision_id) ?? null;
}

function revisionLabel(revision: ResearchRevision): string {
  return `v${revision.revision_number} · ${revision.change_summary}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function ResearchReview({ profile, runResult }: Props) {
  const [data, setData] = useState<ResearchReviewResponse>(EMPTY_REVIEW);
  const [viewedRevisionId, setViewedRevisionId] = useState("");
  const [editor, setEditor] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const initializedRun = useRef("");

  function adoptReview(next: ResearchReviewResponse, preferredRevisionId?: string) {
    setData(next);
    const preferred = next.revisions.find((revision) => revision.id === preferredRevisionId)
      ?? currentRevision(next)
      ?? next.revisions[0]
      ?? null;
    setViewedRevisionId(preferred?.id ?? "");
    setEditor(preferred?.markdown_content ?? "");
    setChangeSummary("");
  }

  useEffect(() => {
    let active = true;
    async function load() {
      if (!profile) return;
      const response = await fetch(`/api/review?profile_id=${encodeURIComponent(profile.id)}`, { cache: "no-store" });
      const payload = await response.json() as ResearchReviewResponse & { error?: string };
      if (!active) return;
      if (!response.ok) {
        setData({ ...EMPTY_REVIEW, blocker: payload.error ?? "Research review could not be loaded." });
        return;
      }
      adoptReview(payload);
    }
    void load();
    return () => { active = false; };
  }, [profile]);

  useEffect(() => {
    let active = true;
    async function importRun() {
      if (!profile || !runResult || initializedRun.current === runResult.run_id) return;
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "initialize_run",
          profile_id: profile.id,
          run_id: runResult.run_id,
          markdown_content: runResult.outputs.markdown.content,
        }),
      });
      const payload = await response.json() as ResearchReviewResponse & { error?: string };
      if (!active) return;
      if (!response.ok) {
        setNotice(payload.error ?? "The completed research could not be added to review.");
        return;
      }
      initializedRun.current = runResult.run_id;
      adoptReview(payload);
      setNotice("Research imported as a new seed revision. Review it before Phase 2.");
    }
    void importRun();
    return () => { active = false; };
  }, [profile, runResult]);

  const acceptedRevisions = useMemo(
    () => data.revisions.filter((revision) => revision.status === "accepted"),
    [data.revisions],
  );
  const current = currentRevision(data);
  const viewed = data.revisions.find((revision) => revision.id === viewedRevisionId) ?? current;
  const approved = data.revisions.find((revision) => revision.id === data.workspace?.approved_revision_id) ?? null;
  const proposedMessages = data.messages.filter((message) => message.proposed_revision_id
    && data.revisions.some((revision) => revision.id === message.proposed_revision_id && revision.status === "proposed"));

  async function reviewAction(
    action: string,
    extra: Record<string, unknown> = {},
    successMessage?: string,
    preferredRevisionId?: string,
  ) {
    if (!profile) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, profile_id: profile.id, ...extra }),
      });
      const payload = await response.json() as ResearchReviewResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The review action could not be completed.");
      adoptReview(payload, preferredRevisionId);
      if (successMessage) setNotice(successMessage);
      return payload;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The review action could not be completed.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  function chooseRevision(id: string) {
    const revision = data.revisions.find((item) => item.id === id);
    if (!revision) return;
    setViewedRevisionId(id);
    setEditor(revision.markdown_content);
    setChangeSummary("");
    setNotice(null);
  }

  async function saveRevision() {
    const payload = await reviewAction(
      viewed?.id === current?.id ? "save_revision" : "restore_revision",
      {
        markdown_content: editor,
        change_summary: changeSummary || (viewed?.id === current?.id ? "Saved manual edits." : `Restored from v${viewed?.revision_number}.`),
        base_revision_id: current?.id,
      },
      viewed?.id === current?.id ? "Saved as a new research revision." : "Restored as a new research revision.",
    );
    if (payload) setChangeSummary("");
  }

  async function submitFeedback(action: "add_note" | "ask_ai") {
    if (!feedback.trim()) return;
    const payload = await reviewAction(
      action,
      { message: feedback.trim() },
      action === "add_note" ? "Feedback saved with this research set." : "Negroni returned a proposed revision.",
    );
    if (payload) setFeedback("");
  }

  if (!profile) {
    return (
      <section className="review-workspace review-empty" id="research-review" aria-labelledby="review-title">
        <div>
          <p className="kicker">Research seed editor</p>
          <h2 id="review-title">Choose a saved research set.</h2>
          <p>Open any client, customer, and competitor combination to edit its seed, leave feedback, and approve the exact revision Phase 2 should use.</p>
        </div>
      </section>
    );
  }

  if (!data.available && data.blocker) {
    return (
      <section className="review-workspace review-empty" id="research-review" aria-labelledby="review-title">
        <div>
          <p className="kicker">Research seed editor</p>
          <h2 id="review-title">Review is blocked.</h2>
          <p>{data.blocker}</p>
        </div>
      </section>
    );
  }

  if (!data.available) {
    return (
      <section className="review-workspace review-empty" id="research-review" aria-labelledby="review-title">
        <div>
          <p className="kicker">Research seed editor</p>
          <h2 id="review-title">Loading the saved seed…</h2>
          <p>Revision history, feedback, and the Phase 2 handoff will appear here.</p>
        </div>
      </section>
    );
  }

  if (!current) {
    return (
      <section className="review-workspace review-empty" id="research-review" aria-labelledby="review-title">
        <div>
          <p className="kicker">Research seed editor</p>
          <h2 id="review-title">Turn this research set into an editable seed.</h2>
          <p>Run the five research passes, or start with your own draft now. Every save becomes a recoverable revision.</p>
          <button type="button" onClick={() => void reviewAction("start_blank", {}, "Blank research seed created.")} disabled={busy}>
            Start a blank seed
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="review-workspace" id="research-review" aria-labelledby="review-title">
      <header className="review-header">
        <div>
          <p className="kicker">Research seed editor</p>
          <h2 id="review-title">Shape what Phase 2 will believe.</h2>
          <p>{profile.offer_or_lead_type} · {profile.country_region}</p>
        </div>
        <div className="seed-state">
          <span className={`seed-status seed-${data.workspace?.status}`}>{data.workspace?.status.replace("_", " ")}</span>
          <strong>Current v{current.revision_number}</strong>
          <small>{approved
            ? approved.id === current.id
              ? `Phase 2 seed is pinned to v${approved.revision_number}`
              : `Phase 2 still uses v${approved.revision_number}; v${current.revision_number} has newer changes`
            : "No Phase 2 seed approved yet"}</small>
        </div>
      </header>

      <div className="review-layout">
        <article className="seed-editor-card">
          <div className="editor-toolbar">
            <label htmlFor="revision-picker">Revision</label>
            <select id="revision-picker" value={viewed?.id ?? ""} onChange={(event) => chooseRevision(event.target.value)}>
              {acceptedRevisions.map((revision) => (
                <option key={revision.id} value={revision.id}>{revisionLabel(revision)}</option>
              ))}
            </select>
            <span>{viewed ? formatDate(viewed.created_at) : null}</span>
          </div>
          {viewed?.id !== current.id ? (
            <div className="revision-warning">You are viewing an earlier revision. Saving restores this content as a new draft; history remains intact.</div>
          ) : approved?.id === current.id ? (
            <div className="revision-approved">This exact revision is the current Phase 2 seed. Editing and saving creates a newer draft without changing existing ads.</div>
          ) : null}
          <label className="editor-label" htmlFor="seed-markdown">Research seed Markdown</label>
          <textarea
            id="seed-markdown"
            className="seed-markdown"
            value={editor}
            onChange={(event) => setEditor(event.target.value)}
            spellCheck
          />
          <div className="save-revision-row">
            <input
              aria-label="Revision summary"
              value={changeSummary}
              onChange={(event) => setChangeSummary(event.target.value)}
              placeholder="What changed? Example: Narrowed buyer to owner-operators"
              maxLength={240}
            />
            <button type="button" onClick={() => void saveRevision()} disabled={busy || editor.trim().length < 100 || editor === viewed?.markdown_content}>
              {viewed?.id === current.id ? "Save new revision" : "Restore as new draft"}
            </button>
          </div>
        </article>

        <aside className="review-conversation" aria-labelledby="conversation-title">
          <div className="conversation-heading">
            <div><span aria-hidden="true">✎</span><strong id="conversation-title">Talk to the research</strong></div>
            <small>{data.ai_available ? "AI revision available" : "Notes and manual edits available"}</small>
          </div>
          <div className="quick-feedback" aria-label="Feedback starters">
            {[
              "I don’t agree with a finding",
              "Add context I know",
              "Change the target audience",
              "Revise the competitor conclusions",
            ].map((prompt) => <button type="button" key={prompt} onClick={() => setFeedback(`${prompt}: `)}>{prompt}</button>)}
          </div>
          <div className="message-list" aria-live="polite">
            {data.messages.length ? data.messages.map((message: ResearchMessage) => (
              <div className={`review-message message-${message.role}`} key={message.id}>
                <strong>{message.role === "user" ? "You" : "Negroni"}</strong>
                <p>{message.body}</p>
                <small>{message.status} · {formatDate(message.created_at)}</small>
              </div>
            )) : <p className="conversation-empty">Disagree with a conclusion, add information, or ask for a different angle. Your notes stay with this research set.</p>}
          </div>
          {proposedMessages.map((message) => {
            const proposal = data.revisions.find((revision) => revision.id === message.proposed_revision_id);
            return proposal ? (
              <div className="proposal-card" key={proposal.id}>
                <span>Proposed v{proposal.revision_number}</span>
                <strong>{proposal.change_summary}</strong>
                <div>
                  <button type="button" onClick={() => void reviewAction("apply_proposal", { revision_id: proposal.id }, "Proposed revision applied.")} disabled={busy}>Apply revision</button>
                  <button type="button" onClick={() => void reviewAction("reject_proposal", { revision_id: proposal.id }, "Proposal rejected.")} disabled={busy}>Reject</button>
                </div>
              </div>
            ) : null;
          })}
          <label htmlFor="research-feedback">What should change?</label>
          <textarea id="research-feedback" value={feedback} onChange={(event) => setFeedback(event.target.value)} rows={5} placeholder="Example: I disagree with the price-sensitivity conclusion. Our closed customers care more about speed than price…" />
          <div className="conversation-actions">
            <button type="button" onClick={() => void submitFeedback("add_note")} disabled={busy || !feedback.trim()}>Save note</button>
            <button className="ask-button" type="button" onClick={() => void submitFeedback("ask_ai")} disabled={busy || !feedback.trim() || !data.ai_available}>Ask Negroni to revise</button>
          </div>
          {!data.ai_available ? <small className="ai-blocker">The secure review runner is not configured yet. You can still edit revisions and save feedback here.</small> : null}
        </aside>
      </div>

      <footer className="seed-handoff">
        <div>
          <span>Phase 2 handoff</span>
          <strong>{approved?.id === current.id ? `Approved seed · v${current.revision_number}` : `Draft seed · v${current.revision_number}`}</strong>
          <p>Ads will record this revision and its fingerprint. Later seed edits create a new version and flag older ads without silently changing them.</p>
        </div>
        <button type="button" onClick={() => void reviewAction("approve", {}, `Revision ${current.revision_number} approved for Phase 2.`)} disabled={busy || approved?.id === current.id}>
          {approved?.id === current.id ? "Approved for Phase 2" : `Approve v${current.revision_number} for Phase 2`}
        </button>
      </footer>
      {notice ? <p className="review-notice" role="status">{notice}</p> : null}
    </section>
  );
}
