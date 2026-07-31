import { authenticatedOwner } from "@/lib/authenticated-user";
import { geminiConnectionService } from "@/lib/connections/runtime";
import type { IntelligenceIntake } from "@/lib/intelligence/contracts";
import { mutationAllowed } from "@/lib/request-security";
import { getDatabase } from "@/lib/database";
import { createResearchApprovalService, D1ApprovalStore } from "@/lib/research-runner/approval";
import { executeApprovedResearch } from "@/app/api/run/route";

export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  const owner = authenticatedOwner(request);
  const headers = { "cache-control": "no-store" };
  if (!owner) return Response.json({ error: "Authentication is required." }, { status: 401, headers });
  if (!mutationAllowed(request)) return Response.json({ error: "A same-origin request is required." }, { status: 403, headers });
  try {
    const { runId } = await context.params;
    const database = await getDatabase();
    if (!database) return Response.json({ status: "blocked", error: "Durable run approval storage is unavailable." }, { status: 503, headers });
    const connected = geminiConnectionService ? (await geminiConnectionService.status(owner)).status === "connected" : false;
    await createResearchApprovalService(new D1ApprovalStore(database)).authorizeStart(owner, runId, connected);
    return executeApprovedResearch(owner, await request.json() as IntelligenceIntake);
  } catch { return Response.json({ status: "blocked", error: "Research approval is missing, expired, already used, or invalid." }, { status: 409, headers }); }
}
