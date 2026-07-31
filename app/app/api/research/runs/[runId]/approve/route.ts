import { authenticatedOwner } from "@/lib/authenticated-user";
import { mutationAllowed } from "@/lib/request-security";
import { getDatabase } from "@/lib/database";
import { createResearchApprovalService, D1ApprovalStore } from "@/lib/research-runner/approval";

const headers = { "cache-control": "no-store" };

export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  const owner = authenticatedOwner(request);
  if (!owner) return Response.json({ error: "Authentication is required." }, { status: 401, headers });
  if (!mutationAllowed(request)) return Response.json({ error: "A same-origin request is required." }, { status: 403, headers });
  try {
    const { runId } = await context.params;
    const database = await getDatabase();
    if (!database) return Response.json({ error: "Durable run approval storage is unavailable." }, { status: 503, headers });
    return Response.json(await createResearchApprovalService(new D1ApprovalStore(database)).approve(owner, runId), { headers });
  } catch { return Response.json({ error: "Run approval could not be recorded." }, { status: 400, headers }); }
}
