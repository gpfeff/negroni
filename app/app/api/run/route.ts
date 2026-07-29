import { assertNoSecretMaterial } from "@/lib/contracts/secrets-core.mjs";
import { authenticatedOwner } from "@/lib/authenticated-user";
import type { IntelligenceIntake, RunCapability, RunError } from "@/lib/intelligence/contracts";
import { buildResearchName, parseRunResult, RUNNER_BLOCKER, validateIntake } from "@/lib/intelligence/validation";

function configuration() {
  return {
    url: process.env.LEAD_INTELLIGENCE_RUNNER_URL?.trim() ?? "",
    token: process.env.LEAD_INTELLIGENCE_RUNNER_TOKEN?.trim() ?? "",
  };
}

export async function GET(): Promise<Response> {
  const config = configuration();
  const capability: RunCapability = config.url && config.token
    ? { available: true, status: "ready", blocker: null }
    : { available: false, status: "blocked", blocker: RUNNER_BLOCKER };
  return Response.json(capability, { status: 200, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const owner = authenticatedOwner(request);
  if (!owner) {
    const error: RunError = { status: "blocked", error: "Authentication is required." };
    return Response.json(error, { status: 401 });
  }
  const config = configuration();
  if (!config.url || !config.token) {
    const error: RunError = { status: "blocked", error: RUNNER_BLOCKER };
    return Response.json(error, { status: 503 });
  }
  try {
    const intake = await request.json() as IntelligenceIntake;
    const errors = validateIntake(intake);
    if (errors.length) {
      return Response.json({ status: "failed", error: errors.join(" ") } satisfies RunError, { status: 400 });
    }
    assertNoSecretMaterial(intake, "Research intake");

    const runnerResponse = await fetch(config.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
        "x-negroni-owner": owner,
      },
      body: JSON.stringify(intake),
      signal: AbortSignal.timeout(15 * 60 * 1000),
    });
    const payload = await runnerResponse.json();
    if (!runnerResponse.ok) throw new Error("The secure research runner could not complete the request.");
    const researchName = buildResearchName(intake.offer_or_lead_type, intake.country_region);
    return Response.json(parseRunResult(payload, researchName), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const response: RunError = { status: "failed", error: error instanceof Error ? error.message : "The research run failed." };
    return Response.json(response, { status: 502 });
  }
}
