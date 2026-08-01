import { assertNoSecretMaterial } from "@/lib/contracts/secrets-core.mjs";
import { authenticatedOwner } from "@/lib/authenticated-user";
import type { IntelligenceIntake, RunCapability, RunError } from "@/lib/intelligence/contracts";
import type { ResearchFilingScope } from "@/lib/research-runner/contracts";
import { safeServiceUrl } from "@/lib/safe-service-url";
import { buildResearchName, parseRunResult, RUNNER_BLOCKER, validateIntake } from "@/lib/intelligence/validation";

function configuration() {
  return {
    url: process.env.LEAD_INTELLIGENCE_RUNNER_URL?.trim() ?? "",
    token: process.env.LEAD_INTELLIGENCE_RUNNER_TOKEN?.trim() ?? "",
  };
}

export async function GET(request: Request): Promise<Response> {
  const config = configuration();
  let capability: RunCapability = { available: false, status: "blocked", blocker: RUNNER_BLOCKER };
  const owner = authenticatedOwner(request);
  if (config.url && config.token && owner) {
    try {
      const runnerUrl = safeServiceUrl(config.url);
      if (!runnerUrl) throw new Error("Unsafe runner URL.");
      runnerUrl.pathname = "/health";
      runnerUrl.search = "";
      const response = await fetch(runnerUrl, {
        headers: {
          authorization: `Bearer ${config.token}`,
          "x-negroni-owner": owner,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(3_000),
      });
      const receipt = await response.json() as {
        contract?: string;
        capabilities?: Record<string, string>;
      };
      const required = ["prompt_source", "research_engine", "google_drive"];
      if (response.ok
        && receipt.contract === "negroni-runner-capability"
        && required.every((name) => receipt.capabilities?.[name] && receipt.capabilities[name] !== "blocked")) {
        capability = { available: true, status: "ready", blocker: null };
      }
    } catch {
      // Keep the public capability blocked when the server-side runner is unavailable.
    }
  }
  return Response.json(capability, { status: 200, headers: { "cache-control": "no-store" } });
}

export async function executeApprovedResearch(
  owner: string,
  approvedRunId: string,
  intake: IntelligenceIntake,
  filingScope: ResearchFilingScope,
): Promise<Response> {
  const config = configuration();
  if (!config.url || !config.token) {
    const error: RunError = { status: "blocked", error: RUNNER_BLOCKER };
    return Response.json(error, { status: 503 });
  }
  try {
    if (!/^run_[a-f0-9]{24}$/.test(approvedRunId)) {
      return Response.json({ status: "failed", error: "A valid exact approved run ID is required." } satisfies RunError, { status: 400 });
    }
    const errors = validateIntake(intake);
    if (errors.length) {
      return Response.json({ status: "failed", error: errors.join(" ") } satisfies RunError, { status: 400 });
    }
    assertNoSecretMaterial(intake, "Research intake");
    const runnerUrl = safeServiceUrl(config.url);
    if (!runnerUrl) throw new Error("The secure research runner must use HTTPS or loopback HTTP.");

    let runnerResponse: Response;
    let payload: unknown;
    try {
      runnerResponse = await fetch(runnerUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.token}`,
          "content-type": "application/json",
          "x-negroni-owner": owner,
          "x-negroni-approved-run-id": approvedRunId,
          "x-negroni-brand-id": filingScope.brand_id,
          "x-negroni-offer-id": filingScope.offer_id,
        },
        body: JSON.stringify(intake),
        signal: AbortSignal.timeout(15 * 60 * 1000),
      });
      payload = await runnerResponse.json();
    } catch {
      throw new Error("The secure research runner could not be reached.");
    }
    if (!runnerResponse.ok) throw new Error("The secure research runner could not complete the request.");
    const researchName = buildResearchName(intake.offer_or_lead_type, intake.country_region);
    return Response.json(parseRunResult(payload, researchName), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const response: RunError = { status: "failed", error: error instanceof Error ? error.message : "The research run failed." };
    return Response.json(response, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const owner = authenticatedOwner(request);
  if (!owner) return Response.json({ status: "blocked", error: "Authentication is required." } satisfies RunError, { status: 401 });
  return Response.json({ status: "blocked", error: "Create and approve an exact run ID before starting Standard Deep Research." } satisfies RunError, { status: 409 });
}
