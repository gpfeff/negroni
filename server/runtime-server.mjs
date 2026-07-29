import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { CodexAppServerClient } from "./codex-app-server-client.mjs";
import { laneIds, runOutputSchema } from "./run-output-schema.mjs";
import { assertNoSecretMaterial } from "../lib/contracts/secrets-core.mjs";

const execFileAsync = promisify(execFile);
const projectRoot = resolve(
  process.env.WORKBENCH_PROJECT_ROOT ??
    join(dirname(fileURLToPath(import.meta.url)), ".."),
);
const skillRoot = resolve(
  process.env.WORKBENCH_SKILL_ROOT ??
    join(
      homedir(),
      "Documents",
      "skills",
      "lead-generation-ads-discovery-intelligence",
    ),
);
const skillPath = join(skillRoot, "SKILL.md");
const codexBin = process.env.WORKBENCH_CODEX_BIN ?? "codex";
const stateRoot = resolve(
  process.env.WORKBENCH_STATE_ROOT ??
    (platform() === "darwin"
      ? join(
          homedir(),
          "Library",
          "Application Support",
          "Lead Intelligence Workbench",
        )
      : join(homedir(), ".local", "state", "lead-intelligence-workbench")),
);
const port = Number(process.env.WORKBENCH_RUNTIME_PORT ?? 4317);
const allowedOrigins = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
const targetSkillName = "lead-generation-ads-discovery-intelligence";
const permissionProfile = "lead-intel-research";
const permissionProfileConfig =
  'permissions.lead-intel-research={description="Lead intelligence read-only web research",filesystem={":minimal"="read",":workspace_roots"={"."="read"}},network={enabled=true,domains={"*"="allow"}}}';
const sectionContract = [
  ["00", "Project Brief", "00-project-brief.md"],
  ["01", "Market Awareness", "01-market-awareness.md"],
  ["02", "B2B Lead-Buyer Intelligence", "02-b2b-lead-buyer-intelligence.md"],
  ["03", "B2C Lead-Consumer Intelligence", "03-b2c-lead-consumer-intelligence.md"],
  ["04", "Competitor, Ad & Funnel Intelligence", "04-competitor-ad-and-funnel-intelligence.md"],
  ["05", "Lead Product & Qualification Specification", "05-lead-product-and-qualification-spec.md"],
  ["06", "Messaging & Creative Strategy", "06-messaging-and-creative-strategy.md"],
  ["07", "Funnel Blueprint", "07-funnel-blueprint.md"],
  ["08", "Brand & Tone of Voice", "08-brand-and-tone-of-voice.md"],
  ["09", "Master Marketing Intelligence", "09-master-marketing-intelligence.md"],
];

function codexEnvironment() {
  const names = [
    "HOME",
    "PATH",
    "USER",
    "LOGNAME",
    "SHELL",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "LC_ALL",
    "TERM",
    "CODEX_HOME",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_CACHE_HOME",
  ];
  return Object.fromEntries(
    names
      .filter((name) => process.env[name] !== undefined)
      .map((name) => [name, process.env[name]]),
  );
}

function appServerClient() {
  return new CodexAppServerClient({
    codexBin,
    codexArgs: [
      "app-server",
      "--strict-config",
      "--listen",
      "stdio://",
      "-c",
      permissionProfileConfig,
    ],
    codexEnv: codexEnvironment(),
  });
}

function corsHeaders(origin) {
  const headers = {
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "no-store",
  };
  if (origin && allowedOrigins.has(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers.vary = "origin";
  }
  return headers;
}

function json(response, status, body, origin) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...corsHeaders(origin),
  });
  response.end(`${JSON.stringify(body)}\n`);
}

async function readBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 2_000_000) {
      throw new Error("Run request exceeds the 2 MB local limit.");
    }
  }
  return JSON.parse(body);
}

function assertSafeRequest(input) {
  if (!input || typeof input !== "object") throw new Error("Run request is missing.");
  if (input.intake?.schema_version !== "1.0") {
    throw new Error("Canonical intake schema_version must be 1.0.");
  }
  if (!Array.isArray(input.external_actions_allowed)) {
    throw new Error("External-action allowlist must be an array.");
  }
  if (input.external_actions_allowed.length > 0) {
    throw new Error(
      "The MVP local adapter only accepts an empty external-action allowlist.",
    );
  }
  if (typeof input.deterministic_project_brief !== "string") {
    throw new Error("Deterministic 00-project-brief.md is missing.");
  }
  assertNoSecretMaterial(input, "The local runtime request");
}

async function skillDigest() {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (/\.(?:md|ya?ml|json)$/i.test(entry.name)) files.push(path);
    }
  }
  await visit(skillRoot);
  files.sort();
  const hash = createHash("sha256");
  for (const path of files) {
    hash.update(path.slice(skillRoot.length));
    hash.update(await readFile(path));
  }
  return hash.digest("hex");
}

async function codexVersion() {
  const { stdout } = await execFileAsync(codexBin, ["--version"], {
    timeout: 15_000,
  });
  return stdout.trim();
}

async function inspectCapability() {
  await Promise.all([stat(skillPath), stat(projectRoot)]);
  const client = appServerClient();
  try {
    await client.initialize({
      name: "lead_intelligence_workbench",
      title: "Lead Intelligence Workbench",
      version: "0.1.0",
    });
    const result = await client.request(
      "skills/list",
      { cwds: [projectRoot], forceReload: true },
      30_000,
    );
    const entry = result?.data?.find((item) => item.cwd === projectRoot);
    const skill = entry?.skills?.find(
      (item) =>
        item.name === targetSkillName &&
        item.path === skillPath &&
        item.enabled === true,
    );
    return {
      available: Boolean(skill),
      mode: "codex_app_server",
      label: "Local Codex runtime",
      detail: skill
        ? "Canonical shared skill resolved through Codex App Server."
        : "Canonical shared skill is missing or disabled.",
      codex_version: await codexVersion(),
      skill_available: Boolean(skill),
    };
  } finally {
    client.close();
  }
}

function validateAgentOutput(output) {
  if (!output || typeof output !== "object") {
    throw new Error("Structured run output is not an object.");
  }
  const returnedLaneIds = output.lanes?.map((lane) => lane.id) ?? [];
  if (
    returnedLaneIds.length !== laneIds.length ||
    new Set(returnedLaneIds).size !== laneIds.length ||
    laneIds.some((id) => !returnedLaneIds.includes(id))
  ) {
    throw new Error("Structured run output must contain every lane exactly once.");
  }
  const evidenceIds = output.evidence?.map((item) => item.evidence_id) ?? [];
  if (
    evidenceIds.some((id) => typeof id !== "string" || !id.trim()) ||
    new Set(evidenceIds).size !== evidenceIds.length
  ) {
    throw new Error("Evidence IDs are not unique.");
  }
  const findingIds = output.findings?.map((item) => item.id) ?? [];
  if (
    findingIds.some((id) => typeof id !== "string" || !id.trim()) ||
    new Set(findingIds).size !== findingIds.length
  ) {
    throw new Error("Finding IDs are not unique.");
  }
  for (const finding of output.findings ?? []) {
    if (!finding.evidence_ids?.length) {
      throw new Error(`Finding ${finding.id} has no supporting evidence IDs.`);
    }
    for (const id of finding.evidence_ids ?? []) {
      if (!evidenceIds.includes(id)) {
        throw new Error(`Finding ${finding.id} cites missing evidence ${id}.`);
      }
    }
  }
  const allowedPaths = new Map(
    sectionContract.map(([id, , path]) => [id, path]),
  );
  const artifactIds = output.artifacts?.map((item) => item.id) ?? [];
  if (
    artifactIds.some((id) => typeof id !== "string" || !id.trim()) ||
    new Set(artifactIds).size !== artifactIds.length
  ) {
    throw new Error("Artifact IDs are not unique.");
  }
  const artifactSections = output.artifacts?.map((item) => item.section_id) ?? [];
  if (new Set(artifactSections).size !== artifactSections.length) {
    throw new Error("A numbered section can have at most one run artifact.");
  }
  for (const artifact of output.artifacts ?? []) {
    if (allowedPaths.get(artifact.section_id) !== artifact.markdown_path) {
      throw new Error(
        `Artifact ${artifact.id} does not use the canonical section filename.`,
      );
    }
    if (!artifact.markdown.trim()) {
      throw new Error(`Artifact ${artifact.id} is empty.`);
    }
  }
  const resolvableArtifactIds = new Set(["artifact-00", ...artifactIds]);
  for (const lane of output.lanes) {
    for (const id of lane.artifact_ids ?? []) {
      if (!resolvableArtifactIds.has(id)) {
        throw new Error(`Lane ${lane.id} references missing artifact ${id}.`);
      }
    }
  }

  const laneStates = output.lanes.map((lane) => lane.state);
  const derivedState = laneStates.includes("failed")
    ? "failed"
    : laneStates.includes("needs_review")
      ? "needs_review"
      : laneStates.some((state) =>
            ["partial", "blocked", "ready", "not_started"].includes(state),
          )
        ? "partial"
        : "needs_review";
  if (output.state !== derivedState) {
    throw new Error(
      `Overall run state ${output.state} disagrees with lane-derived state ${derivedState}.`,
    );
  }
}

function documentState(output) {
  return sectionContract.map(([section_id, title, markdown_path]) => {
    const artifact =
      section_id === "00"
        ? { state: "generated" }
        : output.artifacts.find((item) => item.section_id === section_id);
    return {
      section_id,
      title,
      markdown_path,
      markdown_state: artifact?.state ?? "planned",
      google_doc_state: "not_published",
      parity_state: "unverified",
      google_doc_url: null,
      limitation:
        "No native Google Doc was created or read back in this bounded MVP run. document-manifest.json does not exist.",
    };
  });
}

async function executeRun(input) {
  assertSafeRequest(input);
  const capability = await inspectCapability();
  if (!capability.available) throw new Error(capability.detail);

  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const runOutputRoot = join(stateRoot, "runs", runId);
  await mkdir(runOutputRoot, { recursive: true, mode: 0o700 });
  const authorizedSources = (input.authorized_sources ?? []).map((source) =>
    source.kind === "local_file"
      ? {
          ...source,
          status: "unavailable",
          notes: `${source.notes ? `${source.notes} ` : ""}Metadata only; file bytes and a readable path were not supplied to this adapter.`,
        }
      : source,
  );

  const client = appServerClient();
  let threadId = null;
  try {
    await client.initialize({
      name: "lead_intelligence_workbench",
      title: "Lead Intelligence Workbench",
      version: "0.1.0",
    });
    const listed = await client.request(
      "skills/list",
      { cwds: [projectRoot], forceReload: true },
      30_000,
    );
    const exactSkill = listed?.data
      ?.find((entry) => entry.cwd === projectRoot)
      ?.skills?.find(
        (skill) =>
          skill.name === targetSkillName &&
          skill.path === skillPath &&
          skill.enabled === true,
      );
    if (!exactSkill) {
      throw new Error("Canonical skill changed or became unavailable after health check.");
    }

    const threadResult = await client.request(
      "thread/start",
      {
        cwd: projectRoot,
        approvalPolicy: "never",
        permissions: permissionProfile,
        runtimeWorkspaceRoots: [projectRoot, skillRoot],
        ephemeral: true,
        serviceName: "lead_intelligence_workbench",
      },
      30_000,
    );
    if (
      threadResult.thread.activePermissionProfile?.id !== permissionProfile ||
      threadResult.thread.sandbox?.type !== "readOnly" ||
      threadResult.thread.sandbox?.networkAccess !== true
    ) {
      throw new Error(
        "Codex did not activate the required scoped read-only research profile.",
      );
    }
    threadId = threadResult.thread.id;

    const task = `$${targetSkillName} Execute one bounded Lead Intelligence Workbench MVP run from the supplied canonical intake.

Use the canonical skill as the research authority. Do not duplicate or reinterpret its method.

Hard boundaries:
- External-action allowlist is empty.
- Do not submit forms, call, message, purchase, publish, share, create campaigns, launch traffic, or mutate any live system.
- Do not write project files or create Google Docs in this bounded run.
- Do not manufacture evidence to fill a lane.
- Preserve buyer and consumer evidence separately.
- Return representative evidence and one to four useful numbered Markdown section outputs, not a superficial ten-file package.
- Mark publication blocked and keep the overall result needs_review, partial, or failed.

Canonical intake and app-owned field-state contract:
${JSON.stringify(
  {
    intake: input.intake,
    field_states: input.field_states ?? {},
    raw_answers: input.raw_answers ?? {},
    authorized_sources: authorizedSources,
    external_actions_allowed: [],
    runtime_output_root: runOutputRoot,
  },
  null,
  2,
)}

Return only the requested structured output.`;

    const turnResult = await client.request(
      "turn/start",
      {
        threadId,
        input: [
          { type: "text", text: task },
          {
            type: "skill",
            name: targetSkillName,
            path: skillPath,
          },
        ],
        cwd: projectRoot,
        approvalPolicy: "never",
        permissions: permissionProfile,
        runtimeWorkspaceRoots: [projectRoot, skillRoot],
        outputSchema: runOutputSchema,
      },
      30_000,
    );
    const turn = await client.waitForTurn(turnResult.turn.id);
    const output = JSON.parse(turn.text);
    assertNoSecretMaterial(output, "The structured Codex output");
    validateAgentOutput(output);

    const completedAt = new Date().toISOString();
    const artifacts = [
      {
        id: "artifact-00",
        section_id: "00",
        title: "Project Brief",
        markdown_path: "00-project-brief.md",
        markdown: input.deterministic_project_brief,
        state: "generated",
        limitation: null,
      },
      ...output.artifacts,
    ];
    return {
      schema_version: "1.0",
      run_id: runId,
      project_id: input.project_id,
      mode: "codex_app_server",
      synthetic: false,
      synthetic_label: null,
      adapter_version: "1.0.0",
      skill_name: targetSkillName,
      skill_path: skillPath,
      skill_bundle_sha256: await skillDigest(),
      codex_version: capability.codex_version,
      thread_id: threadId,
      started_at: startedAt,
      completed_at: completedAt,
      state: output.state,
      lanes: output.lanes.map((lane) => ({
        ...lane,
        title:
          lane.id
            .replaceAll("_", " ")
            .replace(/\b\w/g, (letter) => letter.toUpperCase()),
        last_updated: completedAt,
      })),
      evidence: output.evidence,
      findings: output.findings,
      artifacts,
      documents: documentState({ ...output, artifacts }),
      blockers: [
        ...output.blockers,
        "Native Google Docs were not created or verified in this bounded MVP run.",
      ],
      limitations: [
        ...output.limitations,
        "Codex App Server is an experimental local integration surface.",
      ],
      validation: {
        schema_valid: true,
        evidence_ids_unique: true,
        external_actions_empty: true,
        example_leak_scan_passed: null,
      },
    };
  } finally {
    client.close();
  }
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    json(response, 403, { error: "Origin is not allowed." }, origin);
    return;
  }
  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders(origin));
    response.end();
    return;
  }
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    if (request.method === "GET" && url.pathname === "/health") {
      json(response, 200, await inspectCapability(), origin);
      return;
    }
    if (request.method === "POST" && url.pathname === "/runs") {
      json(response, 200, await executeRun(await readBody(request)), origin);
      return;
    }
    json(response, 404, { error: "Not found." }, origin);
  } catch (error) {
    json(
      response,
      400,
      {
        error:
          error instanceof Error
            ? error.message
            : "The local runtime request failed.",
      },
      origin,
    );
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(
    `Lead Intelligence local runtime listening on http://127.0.0.1:${port}\n`,
  );
});
