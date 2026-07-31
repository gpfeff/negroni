export function mutationAllowed(request: Request): boolean {
  const target = new URL(request.url);
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).origin === target.origin; } catch { return false; }
}

export async function boundedJson(request: Request, maximumBytes = 2048): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maximumBytes) throw new Error("Request body is too large.");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) throw new Error("Request body is too large.");
  return JSON.parse(text);
}
