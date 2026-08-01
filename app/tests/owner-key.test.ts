import assert from "node:assert/strict";
import test from "node:test";
import { opaqueOwnerKey } from "@/lib/owner-key";

test("owner identities become stable opaque broker keys", () => {
  const first = opaqueOwnerKey("owner@example.com");
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, opaqueOwnerKey(" owner@example.com "));
  assert.notEqual(first, opaqueOwnerKey("other@example.com"));
  assert.equal(first.includes("owner"), false);
});

test("invalid owner identities fail before broker access", () => {
  assert.throws(() => opaqueOwnerKey("x"), /valid owner identity/);
  assert.throws(() => opaqueOwnerKey("owner@example.com\nforged"), /valid owner identity/);
});
