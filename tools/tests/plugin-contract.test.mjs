import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const expectedSkills = [
  "negroni-start",
  "negroni-research",
  "negroni-creative",
  "negroni-launch",
  "negroni-iteration",
  "negroni-loop",
];

test("the repository is an installable Negroni plugin with the complete five-phase workflow", async () => {
  const manifest = JSON.parse(await readFile(resolve(root, ".codex-plugin/plugin.json"), "utf8"));

  assert.equal(manifest.name, "negroni");
  assert.equal(manifest.skills, "./skills/");
  assert.match(manifest.repository, /^https:\/\/github\.com\/gpfeff\/negroni\/?$/);
  assert.doesNotMatch(JSON.stringify(manifest), /TODO|Local developer/);

  for (const skillName of expectedSkills) {
    const skill = await readFile(resolve(root, "skills", skillName, "SKILL.md"), "utf8");
    assert.match(skill, new RegExp(`^name: ${skillName}$`, "m"));
    assert.doesNotMatch(skill, /\[TODO|TODO:/);
  }
});
