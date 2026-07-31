import { authenticatedOwner } from "@/lib/authenticated-user";
import { mutationAllowed } from "@/lib/request-security";
import { GEMINI_DEEP_RESEARCH_AGENT } from "@/lib/research-runner/gemini-deep-research";
import { RESEARCH_COST, RESEARCH_SCOPE } from "@/lib/research-runner/approval";

const headers = { "cache-control": "no-store" };

export async function POST(request: Request) {
  const owner = authenticatedOwner(request);
  if (!owner) return Response.json({ error: "Authentication is required." }, { status: 401, headers });
  if (!mutationAllowed(request)) return Response.json({ error: "A same-origin request is required." }, { status: 403, headers });
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const runId = `run_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  return Response.json({ run_id: runId, model: GEMINI_DEEP_RESEARCH_AGENT, scope: RESEARCH_SCOPE, estimated_cost: RESEARCH_COST }, { status: 201, headers });
}
