import { execFile } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PROVIDERS = ["codex_cli", "claude_code", "gemini_api", "gemini_oauth", "kie_ai", "apify", "google_drive"];
const brokerToken = process.env.CREDENTIAL_BROKER_TOKEN;
const brokerPort = Number(process.env.NEGRONI_BROKER_PORT || "47831");
const geminiInteractionsBaseUrl = new URL(process.env.NEGRONI_GEMINI_INTERACTIONS_BASE_URL
  || "https://generativelanguage.googleapis.com/v1beta/interactions");
const GEMINI_DEEP_RESEARCH_AGENT = "deep-research-preview-04-2026";
const GOOGLE_FOLDER_MIME = "application/vnd.google-apps.folder";
const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const GOOGLE_SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const googleDriveEnabled = process.env.NEGRONI_GOOGLE_DRIVE_ENABLED === "1";
const googleDriveBaseUrl = new URL(process.env.NEGRONI_GOOGLE_DRIVE_BASE_URL
  || "https://www.googleapis.com/drive/v3/");
const googleDriveUploadBaseUrl = new URL(process.env.NEGRONI_GOOGLE_DRIVE_UPLOAD_BASE_URL
  || "https://www.googleapis.com/upload/drive/v3/");
const brokerStartedAt = new Date().toISOString();
const injectedCredentials = {
  ...(process.env.NEGRONI_GEMINI_API_KEY ? { gemini_api: { api_key: process.env.NEGRONI_GEMINI_API_KEY } } : {}),
  ...(process.env.NEGRONI_KIE_API_KEY ? { kie_ai: { api_key: process.env.NEGRONI_KIE_API_KEY } } : {}),
  ...(process.env.NEGRONI_APIFY_API_TOKEN ? { apify: { api_key: process.env.NEGRONI_APIFY_API_TOKEN } } : {}),
};
const sessionCredentialsByOwner = new Map();
const geminiInteractionByOwnerRun = new Map();

if (!brokerToken) throw new Error("CREDENTIAL_BROKER_TOKEN is required.");

function tokenMatches(expected, header) {
  if (!header?.startsWith("Bearer ")) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(header.slice("Bearer ".length));
  return left.length === right.length && timingSafeEqual(left, right);
}

async function commandStatus(command, args, isConnected, connectedDetail) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: 8_000,
      windowsHide: true,
      env: process.env,
    });
    const output = `${stdout}\n${stderr}`.trim();
    return isConnected(output)
      ? { status: "connected", blocker: null, detail: connectedDetail }
      : { status: "not_connected", blocker: null, detail: "Login required" };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { status: "blocked", blocker: `${command} is not installed.`, detail: null };
    }
    return { status: "not_connected", blocker: null, detail: "Login required" };
  }
}

function ownerIdentity(request) {
  const owner = request.headers.get("x-negroni-owner")?.trim() ?? "";
  return owner.length >= 3 && owner.length <= 320 && !/[\u0000-\u001f\u007f]/.test(owner) ? owner : null;
}

async function readCredentials(owner) {
  return { ...injectedCredentials, ...(sessionCredentialsByOwner.get(owner) ?? {}) };
}

async function storeCredential(owner, provider, apiKey) {
  const credentials = { ...(sessionCredentialsByOwner.get(owner) ?? {}), [provider]: { api_key: apiKey } };
  sessionCredentialsByOwner.set(owner, credentials);
}

function deleteCredential(owner, provider) {
  const credentials = sessionCredentialsByOwner.get(owner);
  if (!credentials?.[provider]) return false;
  const next = { ...credentials };
  delete next[provider];
  if (Object.keys(next).length) sessionCredentialsByOwner.set(owner, next);
  else sessionCredentialsByOwner.delete(owner);
  return true;
}

function credentialMetadata(apiKey) {
  return {
    last_verified_at: brokerStartedAt,
    fingerprint: createHash("sha256").update(apiKey).digest("hex").slice(0, 12),
    last_four: apiKey.slice(-4),
  };
}

function allowedGoogleDriveBase(url) {
  return (url.protocol === "https:" && url.hostname === "www.googleapis.com")
    || (url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname));
}

async function googleAccessToken() {
  const { stdout } = await execFileAsync("gcloud", ["auth", "application-default", "print-access-token"], {
    timeout: 8_000,
    windowsHide: true,
    env: process.env,
    maxBuffer: 64 * 1024,
  });
  const token = stdout.trim();
  if (token.length < 20 || /\s/.test(token)) throw new Error("Google Application Default Credentials are unavailable.");
  return token;
}

async function driveRequest(path, init = {}, upload = false) {
  const base = upload ? googleDriveUploadBaseUrl : googleDriveBaseUrl;
  if (!googleDriveEnabled || !allowedGoogleDriveBase(base)) {
    throw new Error("Google Drive is not enabled on this local bridge.");
  }
  const token = await googleAccessToken();
  const response = await fetch(new URL(path, base), {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`Google Drive request failed (${response.status}).`);
  return response;
}

function driveQueryValue(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

async function findDriveFile({ name, parent, runId, kind, mimeType, appProperties = {} }) {
  const clauses = ["trashed = false"];
  if (name) clauses.push(`name = '${driveQueryValue(name)}'`);
  if (parent) clauses.push(`'${driveQueryValue(parent)}' in parents`);
  if (runId) clauses.push(`appProperties has { key='negroni_run_id' and value='${driveQueryValue(runId)}' }`);
  if (kind) clauses.push(`appProperties has { key='negroni_kind' and value='${driveQueryValue(kind)}' }`);
  for (const [key, value] of Object.entries(appProperties)) {
    clauses.push(`appProperties has { key='${driveQueryValue(key)}' and value='${driveQueryValue(value)}' }`);
  }
  if (mimeType) clauses.push(`mimeType = '${driveQueryValue(mimeType)}'`);
  const search = new URLSearchParams({
    q: clauses.join(" and "),
    fields: "files(id,name,mimeType,parents,webViewLink,appProperties)",
    pageSize: "2",
    spaces: "drive",
  });
  const response = await driveRequest(`files?${search}`);
  const payload = await response.json();
  if (!Array.isArray(payload.files) || payload.files.length > 1) {
    throw new Error("Google Drive returned an ambiguous Negroni filing target.");
  }
  return payload.files[0] ?? null;
}

function safeDriveName(value, label) {
  if (typeof value !== "string") throw new Error(`${label} is required.`);
  const name = value.replace(/[\\/\u0000-\u001f\u007f]+/g, " - ").replace(/\s+/g, " ").trim();
  if (!name || name.length > 160) throw new Error(`${label} is invalid.`);
  return name;
}

async function createDriveFolder(name, parent, appProperties = {}) {
  const response = await driveRequest("files?fields=id,name,mimeType,parents", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: GOOGLE_FOLDER_MIME,
      ...(parent ? { parents: [parent] } : {}),
      ...(Object.keys(appProperties).length ? { appProperties } : {}),
    }),
  });
  return response.json();
}

async function updateDriveFolder(folder, name, appProperties) {
  const response = await driveRequest(`files/${encodeURIComponent(folder.id)}?fields=id,name,mimeType,parents,appProperties`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, appProperties }),
  });
  return response.json();
}

async function ensureDriveFolder(name, parent, appProperties = {}) {
  const hasIdentity = Object.keys(appProperties).length > 0;
  let folder = hasIdentity
    ? await findDriveFile({ parent, mimeType: GOOGLE_FOLDER_MIME, appProperties })
    : await findDriveFile({ name, parent, mimeType: GOOGLE_FOLDER_MIME });
  if (!folder) return createDriveFolder(name, parent, appProperties);
  const identityChanged = Object.entries(appProperties)
    .some(([key, value]) => folder.appProperties?.[key] !== value);
  if (folder.name !== name || identityChanged) {
    return updateDriveFolder(folder, name, { ...folder.appProperties, ...appProperties });
  }
  return folder;
}

async function googleDriveStatus() {
  if (!googleDriveEnabled) {
    return {
      provider: "google_drive",
      status: "blocked",
      blocker: "Google Drive is disabled in the local bridge.",
      detail: null,
      auto_store: false,
    };
  }
  try {
    const [aboutResponse, root] = await Promise.all([
      driveRequest("about?fields=user(emailAddress)"),
      findDriveFile({ name: "Negroni", mimeType: GOOGLE_FOLDER_MIME }),
    ]);
    const about = await aboutResponse.json();
    if (!root) {
      return {
        provider: "google_drive",
        status: "not_connected",
        blocker: null,
        detail: "Connect Google Drive to create the private Negroni folder.",
        account_email: about.user?.emailAddress ?? null,
        folder_id: null,
        folder_name: null,
        auto_store: false,
      };
    }
    return {
      provider: "google_drive",
      status: "connected",
      blocker: null,
      detail: "Google Drive is ready for private Negroni filing.",
      account_email: about.user?.emailAddress ?? null,
      folder_id: root.id,
      folder_name: root.name,
      auto_store: true,
    };
  } catch {
    return {
      provider: "google_drive",
      status: "not_connected",
      blocker: null,
      detail: "Google Application Default Credentials need Drive access.",
      auto_store: false,
    };
  }
}

function multipartBody(metadata, mediaType, contents) {
  const boundary = `negroni_${randomBytes(12).toString("hex")}`;
  const body = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${mediaType}\r\n\r\n${contents}\r\n`,
    `--${boundary}--\r\n`,
  ].join("");
  return { boundary, body };
}

async function uploadDriveFile(metadata, mediaType, contents) {
  const multipart = multipartBody(metadata, mediaType, contents);
  const response = await driveRequest("files?uploadType=multipart&fields=id,name,mimeType,parents", {
    method: "POST",
    headers: { "content-type": `multipart/related; boundary=${multipart.boundary}` },
    body: multipart.body,
  }, true);
  return response.json();
}

async function driveMetadata(id) {
  const fields = new URLSearchParams({ fields: "id,name,mimeType,parents,webViewLink,appProperties" });
  return (await driveRequest(`files/${encodeURIComponent(id)}?${fields}`)).json();
}

async function privateDriveFile(id) {
  const fields = new URLSearchParams({ fields: "permissions(id,type,role)" });
  const payload = await (await driveRequest(`files/${encodeURIComponent(id)}/permissions?${fields}`)).json();
  return Array.isArray(payload.permissions)
    && payload.permissions.every((permission) => !["anyone", "domain"].includes(permission.type));
}

async function exportDriveFile(id, mimeType) {
  const search = new URLSearchParams({ mimeType });
  return (await driveRequest(`files/${encodeURIComponent(id)}/export?${search}`)).text();
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function parseCsv(value) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const input = value.replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("Google Sheet readback returned malformed CSV.");
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function canonicalWorkspaceText(value) {
  return value
    .replace(/^\uFEFF/, "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

function spreadsheetSafeText(value) {
  const text = String(value ?? "");
  return /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
}

function competitorRows(input) {
  const rows = [["source_id", "title", "url", "accessed_at", "collection_status"]];
  for (const source of input.sources) {
    rows.push([source.id, source.title, source.url, source.accessed_at, input.competitor_collection.status].map(spreadsheetSafeText));
  }
  return rows;
}

function competitorCsv(input) {
  return `${competitorRows(input).map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function validateDriveFilingInput(input) {
  if (!input || typeof input !== "object"
    || typeof input.owner_key !== "string" || input.owner_key.length < 3
    || typeof input.run_id !== "string" || !/^run_[a-f0-9]{24}$/.test(input.run_id)
    || typeof input.brand_id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(input.brand_id)
    || typeof input.offer_id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(input.offer_id)
    || typeof input.markdown !== "string" || input.markdown.trim().length < 20
    || Buffer.byteLength(input.markdown, "utf8") > 2 * 1024 * 1024
    || typeof input.markdown_filename !== "string" || !/^[a-z0-9][a-z0-9._-]{2,199}\.md$/.test(input.markdown_filename)
    || !Array.isArray(input.sources) || input.sources.length > 500
    || typeof input.competitor_collection !== "object" || !input.competitor_collection
    || typeof input.create_competitor_database !== "boolean") {
    throw new Error("The Google Drive filing request is invalid.");
  }
  return {
    ...input,
    brand_name: safeDriveName(input.brand_name, "Brand name"),
    offer_name: safeDriveName(input.offer_name, "Offer name"),
    document_title: safeDriveName(input.document_title, "Document title"),
    sheet_title: safeDriveName(input.sheet_title, "Sheet title"),
  };
}

async function fileResearchInDrive(unknownInput) {
  const input = validateDriveFilingInput(unknownInput);
  const root = await ensureDriveFolder("Negroni", null);
  const brand = await ensureDriveFolder(input.brand_name, root.id, {
    negroni_kind: "brand_folder",
    negroni_owner_key: input.owner_key,
    negroni_brand_id: input.brand_id,
  });
  const offer = await ensureDriveFolder(input.offer_name, brand.id, {
    negroni_kind: "offer_folder",
    negroni_owner_key: input.owner_key,
    negroni_brand_id: input.brand_id,
    negroni_offer_id: input.offer_id,
  });
  const appProperties = {
    negroni_run_id: input.run_id,
    negroni_brand_id: input.brand_id,
    negroni_offer_id: input.offer_id,
  };
  const existingDoc = await findDriveFile({ parent: offer.id, runId: input.run_id, kind: "master_research" });
  const doc = existingDoc || await uploadDriveFile({
    name: input.document_title,
    mimeType: GOOGLE_DOC_MIME,
    parents: [offer.id],
    appProperties: { ...appProperties, negroni_kind: "master_research" },
  }, "text/plain; charset=UTF-8", input.markdown);
  const existingMarkdown = await findDriveFile({ parent: offer.id, runId: input.run_id, kind: "markdown" });
  const markdownFile = existingMarkdown || await uploadDriveFile({
    name: input.markdown_filename,
    mimeType: "text/markdown",
    parents: [offer.id],
    appProperties: { ...appProperties, negroni_kind: "markdown" },
  }, "text/markdown; charset=UTF-8", input.markdown);
  let createdAny = !existingDoc || !existingMarkdown;
  let sheet = null;
  let sheetCsv = null;
  if (input.create_competitor_database) {
    sheetCsv = competitorCsv(input);
    const existingSheet = await findDriveFile({ parent: offer.id, runId: input.run_id, kind: "competitor_database" });
    if (!existingSheet) createdAny = true;
    sheet = existingSheet || await uploadDriveFile({
      name: input.sheet_title,
      mimeType: GOOGLE_SHEET_MIME,
      parents: [offer.id],
      appProperties: { ...appProperties, negroni_kind: "competitor_database" },
    }, "text/csv; charset=UTF-8", sheetCsv);
  }
  const [docMetadata, markdownMetadata, docReadback, markdownReadback, docPrivate, markdownPrivate] = await Promise.all([
    driveMetadata(doc.id),
    driveMetadata(markdownFile.id),
    exportDriveFile(doc.id, "text/plain"),
    (await driveRequest(`files/${encodeURIComponent(markdownFile.id)}?alt=media`)).text(),
    privateDriveFile(doc.id),
    privateDriveFile(markdownFile.id),
  ]);
  let sheetMetadata = null;
  let sheetPrivate = true;
  if (sheet) {
    [sheetMetadata, sheetPrivate] = await Promise.all([
      driveMetadata(sheet.id),
      privateDriveFile(sheet.id),
    ]);
    const sheetReadback = await exportDriveFile(sheet.id, "text/csv");
    if (JSON.stringify(parseCsv(sheetReadback)) !== JSON.stringify(competitorRows(input))) {
      throw new Error("Google Sheet readback did not match the filed competitor database.");
    }
  }
  const soleParent = [docMetadata, markdownMetadata, ...(sheetMetadata ? [sheetMetadata] : [])]
    .every((metadata) => Array.isArray(metadata.parents) && metadata.parents.length === 1 && metadata.parents[0] === offer.id);
  const privateAccess = docPrivate && markdownPrivate && sheetPrivate;
  const docEquivalent = canonicalWorkspaceText(docReadback) === canonicalWorkspaceText(input.markdown);
  if (!docEquivalent || markdownReadback !== input.markdown || !soleParent || !privateAccess) {
    throw new Error("Google Drive filing verification failed.");
  }
  const markdownSha = createHash("sha256").update(input.markdown).digest("hex");
  return {
    status: "verified",
    kind: "live",
    google_doc: { title: input.document_title, url: docMetadata.webViewLink, verified: true },
    google_sheet: sheetMetadata
      ? { title: input.sheet_title, status: "published", url: sheetMetadata.webViewLink, verified: true }
      : { title: input.sheet_title, status: "not_configured", url: null, verified: false, message: "Google publishing not configured." },
    folder_name: `Negroni / ${input.brand_name} / ${input.offer_name}`,
    folder_url: `https://drive.google.com/drive/folders/${offer.id}`,
    markdown_sha256: markdownSha,
    document_readback_sha256: markdownSha,
    sole_parent_verified: soleParent,
    private_access_verified: privateAccess,
    blocker: null,
    external_actions: createdAny ? ["google_files_created"] : [],
  };
}

async function providerStatuses(owner) {
  const credentials = await readCredentials(owner);
  const [codex, claude, geminiOAuth, drive] = await Promise.all([
    commandStatus("codex", ["login", "status"], (output) => /logged in/i.test(output), "Native Codex login is available."),
    commandStatus("claude", ["auth", "status"], (output) => /"loggedIn"\s*:\s*true/.test(output), "Native Claude Code login is available."),
    commandStatus("gcloud", ["auth", "application-default", "print-access-token"], (output) => output.length > 20, "Google Application Default Credentials are available."),
    googleDriveStatus(),
  ]);
  if (claude.status !== "connected" && claude.status !== "blocked") {
    claude.detail = "Claude Code is installed. Login required.";
  }
  return [
    { provider: "codex_cli", ...codex },
    { provider: "claude_code", ...claude },
    {
      provider: "gemini_api",
      status: credentials.gemini_api?.api_key ? "connected" : "not_connected",
      blocker: null,
      detail: credentials.gemini_api?.api_key ? "API key available to this local session" : null,
    },
    { provider: "gemini_oauth", ...geminiOAuth },
    {
      provider: "kie_ai",
      status: credentials.kie_ai?.api_key ? "connected" : "not_connected",
      blocker: null,
      detail: credentials.kie_ai?.api_key ? "API key available to this local session" : null,
    },
    {
      provider: "apify",
      status: credentials.apify?.api_key ? "connected" : "not_connected",
      blocker: null,
      detail: credentials.apify?.api_key ? "API token available to this local session" : null,
    },
    drive,
  ];
}

function allowedGeminiBaseUrl(url) {
  return (url.protocol === "https:" && url.hostname === "generativelanguage.googleapis.com")
    || (url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname));
}

async function proxyGeminiInteraction(owner, path, init) {
  if (!allowedGeminiBaseUrl(geminiInteractionsBaseUrl)) {
    throw new Error("The Gemini Interactions API endpoint is not allowed.");
  }
  const credentials = await readCredentials(owner);
  const apiKey = credentials.gemini_api?.api_key;
  if (typeof apiKey !== "string" || apiKey.length < 20) {
    return json({ error: "Gemini API is not connected." }, 409);
  }
  const target = new URL(path, geminiInteractionsBaseUrl.href.endsWith("/")
    ? geminiInteractionsBaseUrl
    : `${geminiInteractionsBaseUrl.href}/`);
  const response = await fetch(target, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
  });
  const body = await response.text();
  if (!response.ok) {
    process.stderr.write(`Gemini Interactions API rejected the request with status ${response.status}.\n`);
    return json({ error: "Gemini Interactions API request failed.", status: response.status }, 502);
  }
  return new Response(body, {
    status: response.status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function json(response, status = 200) {
  return new Response(JSON.stringify(response), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function handle(request) {
  if (!tokenMatches(brokerToken, request.headers.get("authorization"))) {
    return json({ error: "Unauthorized" }, 401);
  }
  const url = new URL(request.url);
  const owner = ownerIdentity(request);
  if (!owner) return json({ error: "Owner identity required." }, 401);
  if (request.method === "GET" && url.pathname === "/v1/providers/status") {
    return json({ available: true, providers: await providerStatuses(owner), blocker: null });
  }
  if (url.pathname === "/v1/secrets/gemini") {
    const existing = (await readCredentials(owner)).gemini_api?.api_key;
    if (request.method === "GET") {
      return json({ metadata: existing ? credentialMetadata(existing) : null });
    }
    if (request.method === "POST" || request.method === "PUT") {
      const body = await request.json();
      if (body.operation === "read") return json({ api_key: null });
      const apiKey = typeof body.api_key === "string" ? body.api_key.trim() : "";
      if (apiKey.length < 20 || apiKey.length > 512) return json({ changed: false }, 400);
      if ((request.method === "POST" && existing) || (request.method === "PUT" && !existing)) {
        return json({ changed: false });
      }
      await storeCredential(owner, "gemini_api", apiKey);
      return json({ changed: true, metadata: credentialMetadata(apiKey) });
    }
    if (request.method === "DELETE") {
      if (injectedCredentials.gemini_api?.api_key) {
        return json({ changed: false, error: "Gemini is managed by the private service environment." }, 409);
      }
      return json({ changed: deleteCredential(owner, "gemini_api") });
    }
  }
  if (request.method === "POST" && url.pathname === "/v1/providers/connect") {
    const body = await request.json();
    if (!PROVIDERS.includes(body.provider)) return json({ error: "Unsupported provider" }, 400);
    if (body.provider === "gemini_api" || body.provider === "kie_ai" || body.provider === "apify") {
      if (typeof body.api_key !== "string" || body.api_key.trim().length < 20 || body.api_key.trim().length > 512) {
        return json({ error: "A valid API key is required." }, 400);
      }
      if (injectedCredentials[body.provider]?.api_key) {
        return json({ error: "This credential is managed by the private service environment." }, 409);
      }
      const existing = (await readCredentials(owner))[body.provider]?.api_key;
      const expected = existing ? "replace" : "save";
      if (body.confirmation !== expected) {
        return json({ error: `Explicit ${expected} confirmation is required.` }, 400);
      }
      await storeCredential(owner, body.provider, body.api_key.trim());
      return json({ connected: true, message: "API key connected for this local session. Use a 1Password Developer Environment for persistent injection." });
    }
    if (body.provider === "google_drive" && googleDriveEnabled) {
      await ensureDriveFolder("Negroni", null);
      const status = await googleDriveStatus();
      return json({ connected: status.status === "connected", message: status.detail });
    }
    const statuses = await providerStatuses(owner);
    const provider = statuses.find((item) => item.provider === body.provider);
    if (provider?.status === "connected") return json({ connected: true, message: "Connection verified." });
    const loginCommands = {
      codex_cli: "Run `codex login` in Terminal, then check the connection again.",
      claude_code: "Run `claude auth login` in Terminal, then check the connection again.",
      gemini_oauth: "Run `gcloud auth application-default login`, then check the connection again.",
      google_drive: "Enable Google Drive and authenticate Application Default Credentials, then check again.",
    };
    return json({ connected: false, message: loginCommands[body.provider] || provider?.blocker || "Connection is not ready." });
  }
  if (request.method === "DELETE" && url.pathname === "/v1/providers/connect") {
    const body = await request.json();
    if (!["gemini_api", "kie_ai", "apify"].includes(body.provider)) {
      return json({ error: "Unsupported provider" }, 400);
    }
    if (injectedCredentials[body.provider]?.api_key) {
      return json({ error: "This credential is managed by the private service environment." }, 409);
    }
    deleteCredential(owner, body.provider);
    return json({ connected: false, message: "API credential disconnected from this local session." });
  }
  if (request.method === "POST" && url.pathname === "/v1/providers/google-drive/file-research") {
    const body = await request.json();
    if (body?.owner_key !== owner) return json({ error: "Owner identity does not match the filing request." }, 403);
    return json(await fileResearchInDrive(body));
  }
  if (request.method === "POST" && url.pathname === "/v1/providers/gemini/deep-research/interactions") {
    const body = await request.json();
    if (body.agent !== GEMINI_DEEP_RESEARCH_AGENT
      || typeof body.run_id !== "string"
      || !/^run_[a-f0-9]{24}$/.test(body.run_id)
      || typeof body.input !== "string"
      || !body.input.trim()
      || Buffer.byteLength(body.input, "utf8") > 512 * 1024) {
      return json({ error: "Invalid Gemini Deep Research request." }, 400);
    }
    const interactionKey = `${owner}:${body.run_id}`;
    const existingInteractionId = geminiInteractionByOwnerRun.get(interactionKey);
    if (existingInteractionId) {
      return proxyGeminiInteraction(owner, encodeURIComponent(existingInteractionId), { method: "GET" });
    }
    const response = await proxyGeminiInteraction(owner, "", {
      method: "POST",
      body: JSON.stringify({
        input: body.input,
        agent: GEMINI_DEEP_RESEARCH_AGENT,
        agent_config: {
          type: "deep-research",
          thinking_summaries: "none",
          visualization: "auto",
          collaborative_planning: false,
        },
        background: true,
        store: true,
      }),
    });
    if (response.ok) {
      const interaction = await response.clone().json();
      if (typeof interaction.id === "string" && /^v1_[A-Za-z0-9_-]{10,512}$/.test(interaction.id)) {
        geminiInteractionByOwnerRun.set(interactionKey, interaction.id);
      }
    }
    return response;
  }
  const interactionMatch = url.pathname.match(/^\/v1\/providers\/gemini\/deep-research\/interactions\/(v1_[A-Za-z0-9_-]{10,512})$/);
  if (request.method === "GET" && interactionMatch) {
    return proxyGeminiInteraction(owner, encodeURIComponent(interactionMatch[1]), { method: "GET" });
  }
  return json({ error: "Not found" }, 404);
}

const server = createServer(async (request, response) => {
  try {
    const origin = `http://${request.headers.host || `127.0.0.1:${brokerPort}`}`;
    const webResponse = await handle(new Request(new URL(request.url || "/", origin), {
      method: request.method,
      headers: request.headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request,
      duplex: "half",
    }));
    response.writeHead(webResponse.status, Object.fromEntries(webResponse.headers));
    response.end(Buffer.from(await webResponse.arrayBuffer()));
  } catch {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Local credential broker failed." }));
  }
});

server.listen(brokerPort, "127.0.0.1", () => {
  process.send?.({ type: "ready", port: brokerPort });
});
