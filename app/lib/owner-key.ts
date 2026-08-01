import { createHash } from "node:crypto";

export function opaqueOwnerKey(value: string): string {
  const owner = value.trim();
  if (owner.length < 3 || owner.length > 320 || /[\u0000-\u001f\u007f]/.test(owner)) {
    throw new Error("A valid owner identity is required.");
  }
  return createHash("sha256").update(`negroni-owner:${owner}`).digest("hex");
}
