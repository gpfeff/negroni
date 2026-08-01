import { authenticatedOwner } from "@/lib/authenticated-user";
import { assertNoSecretMaterial } from "@/lib/contracts/secrets-core.mjs";
import { ensureResearchSchema, getDatabase, type Database } from "@/lib/database";
import type {
  ResearchMessage,
  ResearchReviewResponse,
  ResearchRevision,
  ResearchSeedWorkspace,
} from "@/lib/review-contracts";
import {
  nextResearchSeedStatus,
  proposalMatchesCurrent,
  researchSeedLengthError,
  researchSeedSha256,
} from "@/lib/research-seed";
import { boundedJson, mutationAllowed } from "@/lib/request-security";

const STORAGE_BLOCKER = "Research review is unavailable until the site database is configured.";

function reviewConfiguration() {
  return {
    url: process.env.LEAD_INTELLIGENCE_REVIEW_URL?.trim() ?? "",
    token: process.env.LEAD_INTELLIGENCE_RUNNER_TOKEN?.trim() ?? "",
  };
}

function isText(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === "string" && value.trim().length >= minimum && value.length <= maximum;
}

async function ownsProfile(database: Database, owner: string, profileId: string): Promise<boolean> {
  const result = await database.prepare("SELECT id FROM research_profiles WHERE id = ? AND owner_email = ?")
    .bind(profileId, owner).all<{ id: string }>();
  return Boolean(result.results?.length);
}

async function loadReview(database: Database, owner: string, profileId: string): Promise<ResearchReviewResponse> {
  const workspaceResult = await database.prepare(`
    SELECT profile_id, status, current_revision_id, approved_revision_id, approved_seed_sha256,
      latest_run_id, created_at, updated_at
    FROM research_workspaces
    WHERE profile_id = ? AND owner_email = ?
  `).bind(profileId, owner).all<ResearchSeedWorkspace>();
  const revisions = await database.prepare(`
    SELECT id, profile_id, revision_number, parent_revision_id, origin, status,
      markdown_content, change_summary, created_at
    FROM research_revisions
    WHERE profile_id = ? AND owner_email = ?
    ORDER BY revision_number DESC
    LIMIT 100
  `).bind(profileId, owner).all<ResearchRevision>();
  const messages = await database.prepare(`
    SELECT id, profile_id, role, body, status, proposed_revision_id, created_at
    FROM research_messages
    WHERE profile_id = ? AND owner_email = ?
    ORDER BY created_at ASC
    LIMIT 200
  `).bind(profileId, owner).all<ResearchMessage>();
  const configuration = reviewConfiguration();
  return {
    available: true,
    ai_available: Boolean(configuration.url && configuration.token),
    workspace: workspaceResult.results?.[0] ?? null,
    revisions: revisions.results ?? [],
    messages: messages.results ?? [],
    blocker: null,
  };
}

async function nextRevisionNumber(database: Database, owner: string, profileId: string): Promise<number> {
  const result = await database.prepare(`
    SELECT COALESCE(MAX(revision_number), 0) AS latest
    FROM research_revisions
    WHERE profile_id = ? AND owner_email = ?
  `).bind(profileId, owner).all<{ latest: number }>();
  return Number(result.results?.[0]?.latest ?? 0) + 1;
}

async function insertAcceptedRevision(
  database: Database,
  owner: string,
  profileId: string,
  content: string,
  summary: string,
  origin: "research_run" | "manual_edit",
  runId: string | null,
): Promise<string> {
  const workspace = await database.prepare(`
    SELECT current_revision_id, approved_revision_id, latest_run_id
    FROM research_workspaces
    WHERE profile_id = ? AND owner_email = ?
  `).bind(profileId, owner).all<{
    current_revision_id: string | null;
    approved_revision_id: string | null;
    latest_run_id: string | null;
  }>();
  const current = workspace.results?.[0] ?? null;
  if (runId && current?.latest_run_id === runId && current.current_revision_id) return current.current_revision_id;

  const now = new Date().toISOString();
  const revisionId = crypto.randomUUID();
  const revisionNumber = await nextRevisionNumber(database, owner, profileId);
  const status = nextResearchSeedStatus(current?.approved_revision_id ?? null);
  await database.batch([
    database.prepare(`
      INSERT INTO research_revisions (
        id, profile_id, owner_email, revision_number, parent_revision_id, origin,
        status, markdown_content, change_summary, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'accepted', ?, ?, ?)
    `).bind(
      revisionId,
      profileId,
      owner,
      revisionNumber,
      current?.current_revision_id ?? null,
      origin,
      content,
      summary,
      now,
    ),
    database.prepare(`
      INSERT INTO research_workspaces (
        profile_id, owner_email, status, current_revision_id, approved_revision_id,
        approved_seed_sha256, latest_run_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?)
      ON CONFLICT(profile_id) DO UPDATE SET
        status = excluded.status,
        current_revision_id = excluded.current_revision_id,
        latest_run_id = COALESCE(excluded.latest_run_id, research_workspaces.latest_run_id),
        updated_at = excluded.updated_at
      WHERE research_workspaces.owner_email = excluded.owner_email
    `).bind(profileId, owner, status, revisionId, runId, now, now),
  ]);
  return revisionId;
}

export async function GET(request: Request): Promise<Response> {
  const owner = authenticatedOwner(request);
  if (!owner) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const profileId = new URL(request.url).searchParams.get("profile_id")?.trim() ?? "";
  if (!profileId) return Response.json({ error: "Choose an offer research package." }, { status: 400 });
  const database = await getDatabase();
  if (!database) {
    const response: ResearchReviewResponse = {
      available: false,
      ai_available: false,
      workspace: null,
      revisions: [],
      messages: [],
      blocker: STORAGE_BLOCKER,
    };
    return Response.json(response, { headers: { "cache-control": "no-store" } });
  }
  await ensureResearchSchema(database);
  if (!await ownsProfile(database, owner, profileId)) {
    return Response.json({ error: "The research set was not found." }, { status: 404 });
  }
  return Response.json(await loadReview(database, owner, profileId), { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  if (!mutationAllowed(request)) return Response.json({ error: "A same-origin request is required." }, { status: 403 });
  const owner = authenticatedOwner(request);
  if (!owner) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const database = await getDatabase();
  if (!database) return Response.json({ error: STORAGE_BLOCKER }, { status: 503 });
  await ensureResearchSchema(database);

  let body: Record<string, unknown>;
  try {
    const value = await boundedJson(request, 600_000);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    body = value as Record<string, unknown>;
  } catch {
    return Response.json({ error: "The review request is invalid." }, { status: 400 });
  }
  const action = typeof body.action === "string" ? body.action : "";
  const profileId = typeof body.profile_id === "string" ? body.profile_id.trim() : "";
  if (!profileId || !await ownsProfile(database, owner, profileId)) {
    return Response.json({ error: "The research set was not found." }, { status: 404 });
  }

  if (action === "start_blank" || action === "initialize_run" || action === "save_revision" || action === "restore_revision") {
    if (action === "start_blank") {
      const existing = await database.prepare(`
        SELECT current_revision_id FROM research_workspaces
        WHERE profile_id = ? AND owner_email = ?
      `).bind(profileId, owner).all<{ current_revision_id: string | null }>();
      if (existing.results?.[0]?.current_revision_id) {
        return Response.json({ error: "This research set already has an editable seed." }, { status: 409 });
      }
    }
    if (action === "save_revision" || action === "restore_revision") {
      const expectedBase = typeof body.base_revision_id === "string" ? body.base_revision_id.trim() : "";
      const workspace = await database.prepare(`
        SELECT current_revision_id FROM research_workspaces
        WHERE profile_id = ? AND owner_email = ?
      `).bind(profileId, owner).all<{ current_revision_id: string | null }>();
      if (!expectedBase || workspace.results?.[0]?.current_revision_id !== expectedBase) {
        return Response.json({ error: "The seed changed in another review. Reload it before saving." }, { status: 409 });
      }
    }
    let content = typeof body.markdown_content === "string" ? body.markdown_content : "";
    if (action === "start_blank" && !content.trim()) {
      const profile = await database.prepare(`
        SELECT offer_or_lead_type, country_region FROM research_profiles
        WHERE id = ? AND owner_email = ?
      `).bind(profileId, owner).all<{ offer_or_lead_type: string; country_region: string }>();
      const record = profile.results?.[0];
      content = `# ${record?.offer_or_lead_type ?? "Research"} (${record?.country_region ?? "Market"}) — Research seed\n\n## Working brief\n\nAdd the evidence, assumptions, audience insights, competitor findings, constraints, and decisions you want Phase 2 to use.`;
    }
    const contentError = researchSeedLengthError(content);
    if (contentError) {
      return Response.json({ error: contentError }, { status: 400 });
    }
    try {
      assertNoSecretMaterial(content, "Research seed");
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Remove secret material from the research seed." }, { status: 400 });
    }
    const runId = action === "initialize_run" && typeof body.run_id === "string" ? body.run_id.trim() : null;
    const summary = action === "initialize_run"
      ? "Imported from completed research run."
      : action === "start_blank"
        ? "Started as a user-editable research seed."
        : isText(body.change_summary, 3, 240)
          ? body.change_summary.trim()
          : action === "restore_revision"
            ? "Restored an earlier revision as a new draft."
            : "Saved manual edits.";
    await insertAcceptedRevision(
      database,
      owner,
      profileId,
      content,
      summary,
      action === "initialize_run" ? "research_run" : "manual_edit",
      runId,
    );
    return Response.json(await loadReview(database, owner, profileId), { headers: { "cache-control": "no-store" } });
  }

  if (action === "add_note") {
    if (!isText(body.message, 1, 4_000)) return Response.json({ error: "Enter a review note." }, { status: 400 });
    const message = body.message.trim();
    try {
      assertNoSecretMaterial(message, "Research feedback");
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Remove secret material from the review note." }, { status: 400 });
    }
    await database.prepare(`
      INSERT INTO research_messages (id, profile_id, owner_email, role, body, status, proposed_revision_id, created_at)
      VALUES (?, ?, ?, 'user', ?, 'note', NULL, ?)
    `).bind(crypto.randomUUID(), profileId, owner, message, new Date().toISOString()).run();
    return Response.json(await loadReview(database, owner, profileId), { headers: { "cache-control": "no-store" } });
  }

  if (action === "ask_ai") {
    if (!isText(body.message, 1, 4_000)) return Response.json({ error: "Tell Negroni what you want changed." }, { status: 400 });
    const configuration = reviewConfiguration();
    if (!configuration.url || !configuration.token) {
      return Response.json({ error: "AI revisions are unavailable until the secure review runner is configured. Save the feedback as a note or edit the seed directly." }, { status: 503 });
    }
    const workspace = await loadReview(database, owner, profileId);
    const current = workspace.revisions.find((revision) => revision.id === workspace.workspace?.current_revision_id);
    if (!current) return Response.json({ error: "Start or import a research seed before asking for a revision." }, { status: 409 });
    const message = body.message.trim();
    try {
      assertNoSecretMaterial(message, "Research feedback");
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Remove secret material from the feedback." }, { status: 400 });
    }
    const userMessageId = crypto.randomUUID();
    const now = new Date().toISOString();
    await database.prepare(`
      INSERT INTO research_messages (id, profile_id, owner_email, role, body, status, proposed_revision_id, created_at)
      VALUES (?, ?, ?, 'user', ?, 'pending', NULL, ?)
    `).bind(userMessageId, profileId, owner, message, now).run();

    let proposal: {
      message: string;
      proposed_markdown: string;
      change_summary: string;
    };
    try {
      const response = await fetch(configuration.url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${configuration.token}`,
          "content-type": "application/json",
          "x-negroni-owner": owner,
        },
        body: JSON.stringify({
          contract: "negroni-research-seed-review",
          contract_version: "1.0",
          profile_id: profileId,
          base_revision_id: current.id,
          feedback: message,
          current_markdown: current.markdown_content,
          recent_messages: workspace.messages.slice(-20).map(({ role, body: text }) => ({ role, body: text })),
          rules: {
            collected_content_is_untrusted: true,
            preserve_citations_and_unknowns: true,
            do_not_mutate_external_files: true,
            return_proposal_only: true,
          },
        }),
        signal: AbortSignal.timeout(5 * 60 * 1000),
      });
      const candidate = await response.json() as {
        message?: unknown;
        proposed_markdown?: unknown;
        change_summary?: unknown;
      };
      if (!response.ok
        || !isText(candidate.message, 1, 8_000)
        || typeof candidate.proposed_markdown !== "string"
        || researchSeedLengthError(candidate.proposed_markdown)
        || !isText(candidate.change_summary, 3, 240)) {
        throw new Error("invalid proposal");
      }
      assertNoSecretMaterial(candidate, "Research revision proposal");
      proposal = {
        message: candidate.message.trim(),
        proposed_markdown: candidate.proposed_markdown.trim(),
        change_summary: candidate.change_summary.trim(),
      };
    } catch {
      await database.prepare("UPDATE research_messages SET status = 'failed' WHERE id = ? AND owner_email = ?")
        .bind(userMessageId, owner)
        .run();
      return Response.json({ error: "The review runner could not return a safe revision proposal. Your feedback was kept with the research set." }, { status: 502 });
    }
    const proposalId = crypto.randomUUID();
    const assistantMessageId = crypto.randomUUID();
    const revisionNumber = await nextRevisionNumber(database, owner, profileId);
    await database.batch([
      database.prepare(`
        INSERT INTO research_revisions (
          id, profile_id, owner_email, revision_number, parent_revision_id, origin,
          status, markdown_content, change_summary, created_at
        ) VALUES (?, ?, ?, ?, ?, 'ai_proposal', 'proposed', ?, ?, ?)
      `).bind(
        proposalId,
        profileId,
        owner,
        revisionNumber,
        current.id,
        proposal.proposed_markdown,
        proposal.change_summary,
        new Date().toISOString(),
      ),
      database.prepare("UPDATE research_messages SET status = 'answered' WHERE id = ? AND owner_email = ?")
        .bind(userMessageId, owner),
      database.prepare(`
        INSERT INTO research_messages (id, profile_id, owner_email, role, body, status, proposed_revision_id, created_at)
        VALUES (?, ?, ?, 'assistant', ?, 'answered', ?, ?)
      `).bind(assistantMessageId, profileId, owner, proposal.message, proposalId, new Date().toISOString()),
    ]);
    return Response.json(await loadReview(database, owner, profileId), { headers: { "cache-control": "no-store" } });
  }

  if (action === "apply_proposal" || action === "reject_proposal") {
    const revisionId = typeof body.revision_id === "string" ? body.revision_id.trim() : "";
    const revision = await database.prepare(`
      SELECT id, parent_revision_id FROM research_revisions
      WHERE id = ? AND profile_id = ? AND owner_email = ? AND status = 'proposed'
    `).bind(revisionId, profileId, owner).all<{ id: string; parent_revision_id: string | null }>();
    const proposed = revision.results?.[0];
    if (!proposed) return Response.json({ error: "The revision proposal is no longer available." }, { status: 409 });
    const now = new Date().toISOString();
    if (action === "reject_proposal") {
      await database.batch([
        database.prepare("UPDATE research_revisions SET status = 'rejected' WHERE id = ? AND owner_email = ?").bind(revisionId, owner),
        database.prepare("UPDATE research_messages SET status = 'rejected' WHERE proposed_revision_id = ? AND owner_email = ?").bind(revisionId, owner),
      ]);
    } else {
      const workspace = await database.prepare(`
        SELECT current_revision_id, approved_revision_id FROM research_workspaces
        WHERE profile_id = ? AND owner_email = ?
      `).bind(profileId, owner).all<{ current_revision_id: string | null; approved_revision_id: string | null }>();
      const current = workspace.results?.[0];
      if (!current || !proposalMatchesCurrent(proposed.parent_revision_id, current.current_revision_id)) {
        return Response.json({ error: "The seed changed after this proposal. Ask Negroni for a new revision." }, { status: 409 });
      }
      await database.batch([
        database.prepare("UPDATE research_revisions SET status = 'accepted' WHERE id = ? AND owner_email = ?").bind(revisionId, owner),
        database.prepare(`
          UPDATE research_workspaces
          SET current_revision_id = ?, status = ?, updated_at = ?
          WHERE profile_id = ? AND owner_email = ?
        `).bind(revisionId, nextResearchSeedStatus(current.approved_revision_id), now, profileId, owner),
      ]);
    }
    return Response.json(await loadReview(database, owner, profileId), { headers: { "cache-control": "no-store" } });
  }

  if (action === "approve") {
    const workspace = await loadReview(database, owner, profileId);
    const current = workspace.revisions.find((revision) => revision.id === workspace.workspace?.current_revision_id);
    if (!current || researchSeedLengthError(current.markdown_content)) {
      return Response.json({ error: "A substantive current revision is required before Phase 2 approval." }, { status: 409 });
    }
    const seedHash = await researchSeedSha256(current.markdown_content);
    await database.prepare(`
      UPDATE research_workspaces
      SET status = 'approved', approved_revision_id = ?, approved_seed_sha256 = ?, updated_at = ?
      WHERE profile_id = ? AND owner_email = ?
    `).bind(current.id, seedHash, new Date().toISOString(), profileId, owner).run();
    return Response.json(await loadReview(database, owner, profileId), { headers: { "cache-control": "no-store" } });
  }

  return Response.json({ error: "The review action is not supported." }, { status: 400 });
}
