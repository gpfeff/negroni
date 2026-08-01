import { authenticatedOwner } from "@/lib/authenticated-user";
import { getGeminiConnectionService } from "@/lib/connections/runtime";
import type { IntelligenceIntake, RunResult } from "@/lib/intelligence/contracts";
import { boundedJson, mutationAllowed } from "@/lib/request-security";
import { getDatabase } from "@/lib/database";
import { createResearchApprovalService, D1ApprovalStore } from "@/lib/research-runner/approval";
import { executeApprovedResearch } from "@/app/api/run/route";
import { assertSavedResearchOffer, persistResearchRunSummary } from "@/lib/research-profiles";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  const owner = authenticatedOwner(request);
  const headers = { "cache-control": "no-store" };
  if (!owner) return Response.json({ error: "Authentication is required." }, { status: 401, headers });
  if (!mutationAllowed(request)) return Response.json({ error: "A same-origin request is required." }, { status: 403, headers });
  const { runId } = await context.params;
  const database = await getDatabase();
  if (!database) return Response.json({ status: "blocked", error: "Durable run approval storage is unavailable." }, { status: 503, headers });
  let profileId: string;
  let intake: IntelligenceIntake;
  let brandId: string;
  try {
    const body = await boundedJson(request, 24_000);
    if (!isRecord(body)
      || Object.keys(body).sort().join(",") !== "intake,profile_id"
      || typeof body.profile_id !== "string"
      || !/^[a-zA-Z0-9_-]{1,128}$/.test(body.profile_id)
      || !isRecord(body.intake)) {
      throw new Error("Invalid research start request.");
    }
    profileId = body.profile_id;
    intake = body.intake as IntelligenceIntake;
    const profile = await assertSavedResearchOffer(database, owner, profileId, intake);
    brandId = profile.brand_id;
  } catch {
    return Response.json({ status: "blocked", error: "Choose and save the exact offer before starting research." }, { status: 400, headers });
  }
  try {
    const geminiConnectionService = await getGeminiConnectionService();
    const connected = geminiConnectionService ? (await geminiConnectionService.status(owner)).status === "connected" : false;
    await createResearchApprovalService(new D1ApprovalStore(database)).authorizeStart(owner, runId, connected);
  } catch {
    return Response.json({ status: "blocked", error: "Research approval is missing, expired, already used, or invalid." }, { status: 409, headers });
  }
  const response = await executeApprovedResearch(owner, runId, intake, { brand_id: brandId, offer_id: profileId });
  if (!response.ok) return response;
  const result = await response.clone().json() as RunResult;
  try {
    await persistResearchRunSummary(database, owner, profileId, intake, result);
  } catch {
    return Response.json({
      status: "failed",
      error: "Research completed, but its verified Drive receipt could not be attached to the saved offer.",
      recovery_url: result.brand_library.folder_url,
    }, { status: 502, headers });
  }
  return response;
}
