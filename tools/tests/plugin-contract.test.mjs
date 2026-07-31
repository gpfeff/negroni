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
  "negroni-draper",
];

test("the repository is an installable Negroni plugin with the complete five-phase workflow", async () => {
  const manifest = JSON.parse(await readFile(resolve(root, ".codex-plugin/plugin.json"), "utf8"));

  assert.equal(manifest.name, "negroni");
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.mcpServers, "./.mcp.json");
  assert.match(manifest.repository, /^https:\/\/github\.com\/gpfeff\/negroni\/?$/);
  assert.doesNotMatch(JSON.stringify(manifest), /TODO|Local developer/);
  assert.ok(Array.isArray(manifest.interface?.defaultPrompt));
  assert.ok(
    manifest.interface.defaultPrompt.length <= 3,
    "plugin starter prompts must stay within the supported three-prompt interface limit",
  );

  for (const skillName of expectedSkills) {
    const skill = await readFile(resolve(root, "skills", skillName, "SKILL.md"), "utf8");
    assert.match(skill, new RegExp(`^name: ${skillName}$`, "m"));
    assert.doesNotMatch(skill, /\[TODO|TODO:/);
  }
});

test("the plugin bundles the narrow cache-portable Negroni MCP", async () => {
  const configuration = JSON.parse(await readFile(resolve(root, ".mcp.json"), "utf8"));
  assert.deepEqual(configuration, {
    mcpServers: {
      negroni: {
        command: "node",
        args: ["./app/bin/negroni-mcp.mjs"],
        cwd: ".",
        startup_timeout_sec: 15,
        tool_timeout_sec: 330,
        required: false,
      },
    },
  });

  const server = await readFile(resolve(root, "app/bin/negroni-mcp.mjs"), "utf8");
  const expectedTools = [
    "capability_status",
    "learning_core_status",
    "draper_query",
    "draper_record_decision",
    "competitor_research",
    "resume_competitor_research",
    "inspect_research_artifact",
  ];
  for (const tool of expectedTools) {
    assert.match(server, new RegExp(`name: ["']${tool}["']`));
  }
  assert.deepEqual(
    [...server.matchAll(/^\s*name: "([^"]+)",$/gm)].map((match) => match[1]),
    expectedTools,
  );
  assert.doesNotMatch(JSON.stringify(configuration), /Users\/|\\\\Users\\\\|\.local\/share/);
});

test("Research requires buyer, customer, case, and ten active Meta competitors", async () => {
  const skill = await readFile(resolve(root, "skills/negroni-research/SKILL.md"), "utf8");

  assert.match(skill, /Client or buyer:/);
  assert.match(skill, /Target customer:/);
  assert.match(skill, /Claims, cases, or jobs:/);
  assert.match(skill, /at least 10 distinct competitors with ads verified active/i);
  assert.match(skill, /Do not count a website, Facebook Page, historical case study/i);
  assert.match(skill, /mark the run `partial` or `blocked`/i);
  assert.match(skill, /official Meta.*2.?3.*Page IDs/i);
  assert.match(skill, /up to 10 Page IDs/i);
  assert.match(skill, /coverage.*constraint/i);
  assert.match(skill, /Do not use Foreplay, Firecrawl, or a Cloudflare scraper/i);
});

test("Research requires the complete customer profile before customer research", async () => {
  const skill = await readFile(resolve(root, "skills/negroni-research/SKILL.md"), "utf8");
  const requiredProfile = [
    "Client/customer name",
    "Profession / job title",
    "Company name",
    "Website or public profile URL",
    "Service or offer purchased",
    "Competitor they use",
    "Industry / niche",
    "Location or market served",
  ];

  assert.match(skill, /Required customer profile/);
  assert.match(skill, /collect every field.*before.*customer research/i);
  for (const field of requiredProfile) {
    assert.ok(skill.includes(`- ${field}`), `missing required customer-profile field: ${field}`);
  }
});
