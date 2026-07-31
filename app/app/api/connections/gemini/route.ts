import { authenticatedOwner } from "@/lib/authenticated-user";
import { GEMINI_BROKER_BLOCKER, geminiConnectionService } from "@/lib/connections/runtime";
import { boundedJson, mutationAllowed } from "@/lib/request-security";

const headers = { "cache-control": "no-store", "content-security-policy": "default-src 'none'" };
function unavailable() { return Response.json({ status: "connection_error", error: GEMINI_BROKER_BLOCKER }, { status: 503, headers }); }

export async function GET(request: Request) {
  const owner = authenticatedOwner(request);
  if (!owner) return Response.json({ error: "Authentication is required." }, { status: 401, headers });
  if (!geminiConnectionService) return Response.json({ status: "connection_error", last_verified_at: null, fingerprint: null, last_four: null, error: GEMINI_BROKER_BLOCKER }, { headers });
  try { return Response.json(await geminiConnectionService.status(owner), { headers }); }
  catch { return Response.json({ status: "connection_error", last_verified_at: null, fingerprint: null, last_four: null, error: "Gemini connection status is temporarily unavailable." }, { status: 502, headers }); }
}

export async function PUT(request: Request) {
  const owner = authenticatedOwner(request);
  if (!owner) return Response.json({ error: "Authentication is required." }, { status: 401, headers });
  if (!mutationAllowed(request)) return Response.json({ error: "A same-origin request is required." }, { status: 403, headers });
  if (!geminiConnectionService) return unavailable();
  try {
    const body = await boundedJson(request) as { api_key?: unknown; confirmation?: unknown };
    if (body.confirmation !== "save" && body.confirmation !== "replace") return Response.json({ error: "Confirm save or replace." }, { status: 400, headers });
    if (typeof body.api_key !== "string") return Response.json({ error: "Enter a valid Gemini API key." }, { status: 400, headers });
    return Response.json(await geminiConnectionService.save(owner, body.api_key, body.confirmation), { headers });
  } catch (error) {
    const allowed = new Set([
      "Request body is too large.", "Enter a valid Gemini API key.", "Gemini verification could not be completed. The key was not saved.",
      "Gemini could not verify this API key. Check the key and try again.", "Gemini is already connected. Use Replace key.",
      "Gemini is not connected. Use Save and verify.", "Gemini connection could not be completed. No credential change was made.",
    ]);
    const message = error instanceof Error && allowed.has(error.message) ? error.message : "Gemini connection failed. No credential change was made.";
    return Response.json({ error: message }, { status: 400, headers });
  }
}

export async function DELETE(request: Request) {
  const owner = authenticatedOwner(request);
  if (!owner) return Response.json({ error: "Authentication is required." }, { status: 401, headers });
  if (!mutationAllowed(request)) return Response.json({ error: "A same-origin request is required." }, { status: 403, headers });
  if (!geminiConnectionService) return unavailable();
  const body = await boundedJson(request).catch(() => ({})) as { confirmation?: unknown };
  if (body.confirmation !== "disconnect Gemini") return Response.json({ error: "Explicit disconnect confirmation is required." }, { status: 400, headers });
  try { return Response.json(await geminiConnectionService.disconnect(owner), { headers }); }
  catch { return Response.json({ error: "Gemini could not be disconnected. No credential change was confirmed." }, { status: 502, headers }); }
}
