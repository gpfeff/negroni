import { assertNoSecretMaterial } from "@/lib/contracts/secrets-core.mjs";
import type { IntelligenceIntake, RunCapability, RunError } from "@/lib/intelligence/contracts";
import { MAX_ATTACHMENT_BYTES, MAX_TOTAL_ATTACHMENT_BYTES, parseRunResult, RUNNER_BLOCKER, validateIntake } from "@/lib/intelligence/validation";

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

    const incomingAttachments = incoming.getAll("attachments");
    if (incomingAttachments.some((attachment) => !(attachment instanceof File))) throw new Error("The attachment upload is invalid.");
    const files = incomingAttachments as File[];
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    const metadataMatches = files.length === intake.attachments.length
      && files.every((file, index) => {
        const metadata = intake.attachments[index];
        return metadata.name === file.name && metadata.size === file.size && metadata.type === file.type;
      });
    if (!metadataMatches || files.some((file) => file.size > MAX_ATTACHMENT_BYTES) || totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      return Response.json({ status: "failed", error: "The uploaded files do not match the validated attachment manifest." } satisfies RunError, { status: 400 });
    }

    const outgoing = new FormData();
    outgoing.set("intake", JSON.stringify(intake));
    for (const attachment of files) outgoing.append("attachments", attachment, attachment.name);
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
