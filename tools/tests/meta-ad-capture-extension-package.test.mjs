import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const extensionRoot = resolve(root, "tools/meta-ad-capture-extension");

test("the capture helper has a narrow public-page permission boundary", async () => {
  const manifest = JSON.parse(await readFile(resolve(extensionRoot, "manifest.json"), "utf8"));
  const source = await Promise.all([
    "capture-core.js",
    "content-script.js",
    "popup.js",
  ].map((file) => readFile(resolve(extensionRoot, file), "utf8")));

  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["downloads"]);
  assert.deepEqual(manifest.content_scripts[0].matches, ["https://*.facebook.com/ads/library/*"]);
  assert.equal(manifest.background, undefined);
  assert.doesNotMatch(JSON.stringify(manifest), /cookies|webRequest|storage|<all_urls>/i);
  assert.doesNotMatch(source.join("\n"), /\b(?:fetch|XMLHttpRequest|chrome\.cookies)\b/);
});

test("Research routes reviewed manual UI evidence through the bundled partial-capture contract", async () => {
  const skill = await readFile(resolve(root, "skills/negroni-research/SKILL.md"), "utf8");
  assert.match(skill, /tools\/meta-ad-capture-extension/);
  assert.match(skill, /user-triggered/i);
  assert.match(skill, /always.*partial/i);
  assert.match(skill, /does not satisfy.*10/i);
});
