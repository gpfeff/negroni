import { assertNoSecretMaterial } from "@/lib/contracts/secrets-core.mjs";
import type { IntelligenceIntake, RunCapability, RunError } from "@/lib/intelligence/contracts";
import { parseRunResult, RUNNER_BLOCKER, validateIntake } from "@/lib/intelligence/validation";

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
  const config = configuration();
  if (!config.url || !config.token) {
    const error: RunError = { status: "blocked", error: RUNNER_BLOCKER };
    return Response.json(error, { status: 503 });
  }
  try {
    const incoming = await request.formData();
    const rawIntake = incoming.get("intake");
    if (typeof rawIntake !== "string") throw new Error("The research intake is missing.");
    const intake = JSON.parse(rawIntake) as IntelligenceIntake;
    const errors = validateIntake(intake);
    if (errors.length) return Response.json({ status: "failed", error: errors.join(" ") } satisfies RunError, { status: 400 });
    assertNoSecretMaterial(intake, "Research intake");

    const outgoing = new FormData();
    outgoing.set("intake", JSON.stringify(intake));
    for (const attachment of incoming.getAll("attachments")) {
      if (attachment instanceof File) outgoing.append("attachments", attachment, attachment.name);
    }
    const runnerResponse = await fetch(config.url, {
      method: "POST",
      headers: { authorization: `Bearer ${config.token}` },
      body: outgoing,
      signal: AbortSignal.timeout(15 * 60 * 1000),
    });
    const payload = await runnerResponse.json();
    if (!runnerResponse.ok) throw new Error("The secure research runner could not complete the request.");
    return Response.json(parseRunResult(payload, intake.project_name), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const response: RunError = { status: "failed", error: error instanceof Error ? error.message : "The research run failed." };
    return Response.json(response, { status: 502 });
  }
}
