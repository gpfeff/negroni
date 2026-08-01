import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const appRoot = resolve(import.meta.dirname, "..");
const brokerPath = join(appRoot, "scripts", "local-broker.mjs");
const accessToken = "fake-google-drive-access-token";
const ownerKey = "opaque-owner";

async function unusedPort() {
  const server = createServer();
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  await new Promise<void>((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
  return address.port;
}

async function waitForBroker(port: number, token: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/providers/status`, {
        headers: { authorization: `Bearer ${token}`, "x-negroni-owner": ownerKey },
      });
      if (response.ok) return response;
    } catch {
      // The broker may still be binding its loopback port.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  throw new Error("The local broker did not become ready.");
}

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  content: string;
  appProperties?: Record<string, string>;
};

type DriveFilingReceipt = {
  status: string;
  kind: string;
  folder_name: string;
  folder_url: string;
  google_doc: { url: string };
  google_sheet: { url: string };
  sole_parent_verified: boolean;
  private_access_verified: boolean;
  external_actions: string[];
};

function fakeDrive() {
  const files = new Map<string, DriveFile>([["root-negroni", {
    id: "root-negroni",
    name: "Negroni",
    mimeType: "application/vnd.google-apps.folder",
    parents: ["drive-root"],
    content: "",
  }]]);
  let sequence = 0;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.headers.authorization !== `Bearer ${accessToken}`) {
      response.writeHead(401).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString("utf8");
    const send = (value: unknown, status = 200) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(value));
    };

    if (request.method === "GET" && url.pathname === "/drive/v3/about") {
      send({ user: { emailAddress: "owner@example.test" } });
      return;
    }
    if (request.method === "GET" && url.pathname === "/drive/v3/files") {
      const query = url.searchParams.get("q") ?? "";
      const name = query.match(/name = '((?:\\'|[^'])*)'/)?.[1]?.replaceAll("\\'", "'");
      const parent = query.match(/'([^']+)' in parents/)?.[1];
      const properties = [...query.matchAll(/appProperties has \{ key='([^']+)' and value='([^']+)' \}/g)]
        .map(([, key, value]) => [key!, value!] as const);
      const matches = [...files.values()].filter((file) => (!name || file.name === name)
        && (!parent || file.parents.includes(parent))
        && properties.every(([key, value]) => file.appProperties?.[key] === value));
      send({ files: matches.map((file) => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        parents: file.parents,
        webViewLink: file.mimeType === "application/vnd.google-apps.folder"
          ? `https://drive.google.com/drive/folders/${file.id}`
          : undefined,
        appProperties: file.appProperties,
      })) });
      return;
    }
    if (request.method === "POST" && url.pathname === "/drive/v3/files") {
      const metadata = JSON.parse(body) as Omit<DriveFile, "id" | "content">;
      const id = `folder-${++sequence}`;
      const file = { ...metadata, id, content: "" };
      files.set(id, file);
      send({ id, name: file.name, mimeType: file.mimeType, parents: file.parents });
      return;
    }
    if (request.method === "POST" && url.pathname === "/upload/drive/v3/files") {
      const boundary = String(request.headers["content-type"]).match(/boundary=([^;]+)/)?.[1];
      assert.ok(boundary);
      const parts = body.split(`--${boundary}`).filter((part) => part.includes("\r\n\r\n"));
      const metadata = JSON.parse(parts[0]!.split("\r\n\r\n")[1]!.replace(/\r\n$/, "")) as Omit<DriveFile, "id" | "content">;
      const content = parts[1]!.split("\r\n\r\n")[1]!.replace(/\r\n$/, "");
      const id = `file-${++sequence}`;
      files.set(id, { ...metadata, id, content });
      send({ id, name: metadata.name, mimeType: metadata.mimeType, parents: metadata.parents });
      return;
    }
    const permissions = url.pathname.match(/^\/drive\/v3\/files\/([^/]+)\/permissions$/);
    if (request.method === "GET" && permissions) {
      send({ permissions: [{ id: "owner", type: "user", role: "owner" }] });
      return;
    }
    const exported = url.pathname.match(/^\/drive\/v3\/files\/([^/]+)\/export$/);
    if (request.method === "GET" && exported) {
      const file = files.get(exported[1]!);
      if (!file) return send({ error: "not found" }, 404);
      response.writeHead(200, { "content-type": url.searchParams.get("mimeType") ?? "text/plain" });
      response.end(file.mimeType === "application/vnd.google-apps.document"
        ? `\uFEFF${file.content.replaceAll("\n", "\r\n").replaceAll("\r\n\r\n", "\r\n\r\n\r\n").trimEnd()}`
        : file.mimeType === "application/vnd.google-apps.spreadsheet"
          ? file.content.replaceAll('"', "").replaceAll("\n", "\r\n")
          : file.content);
      return;
    }
    const metadata = url.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (request.method === "PATCH" && metadata) {
      const file = files.get(metadata[1]!);
      if (!file) return send({ error: "not found" }, 404);
      const update = JSON.parse(body) as Pick<DriveFile, "name" | "appProperties">;
      file.name = update.name;
      file.appProperties = update.appProperties;
      send({ id: file.id, name: file.name, mimeType: file.mimeType, parents: file.parents, appProperties: file.appProperties });
      return;
    }
    if (request.method === "GET" && metadata) {
      const file = files.get(metadata[1]!);
      if (!file) return send({ error: "not found" }, 404);
      if (url.searchParams.get("alt") === "media") {
        response.writeHead(200, { "content-type": file.mimeType });
        response.end(file.content);
        return;
      }
      const webViewLink = file.mimeType === "application/vnd.google-apps.document"
        ? `https://docs.google.com/document/d/${file.id}/edit`
        : file.mimeType === "application/vnd.google-apps.spreadsheet"
          ? `https://docs.google.com/spreadsheets/d/${file.id}/edit`
          : `https://drive.google.com/file/d/${file.id}/view`;
      send({ id: file.id, name: file.name, mimeType: file.mimeType, parents: file.parents, webViewLink });
      return;
    }
    send({ error: "not found" }, 404);
  });
  return { server, files };
}

test("local Drive filing creates and verifies Negroni / Brand / Offer deliverables", async () => {
  const directory = await mkdtemp(join(tmpdir(), "negroni-drive-broker-"));
  const gcloud = join(directory, "gcloud");
  await writeFile(gcloud, `#!/bin/sh\nprintf '%s\\n' '${accessToken}'\n`, { mode: 0o700 });
  await chmod(gcloud, 0o700);
  const drive = fakeDrive();
  await new Promise<void>((resolvePromise) => drive.server.listen(0, "127.0.0.1", resolvePromise));
  const driveAddress = drive.server.address();
  assert.ok(driveAddress && typeof driveAddress === "object");
  const brokerPort = await unusedPort();
  const brokerToken = "local-drive-broker-token";
  const driveBase = `http://127.0.0.1:${driveAddress.port}`;
  const broker = spawn(process.execPath, [brokerPath], {
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH ?? ""}`,
      CREDENTIAL_BROKER_TOKEN: brokerToken,
      NEGRONI_BROKER_PORT: String(brokerPort),
      NEGRONI_CREDENTIALS_PATH: join(directory, "credentials.json"),
      NEGRONI_GOOGLE_DRIVE_ENABLED: "1",
      NEGRONI_GOOGLE_DRIVE_BASE_URL: `${driveBase}/drive/v3/`,
      NEGRONI_GOOGLE_DRIVE_UPLOAD_BASE_URL: `${driveBase}/upload/drive/v3/`,
    },
  });
  try {
    const statusResponse = await waitForBroker(brokerPort, brokerToken);
    const status = await statusResponse.json() as { providers: Array<Record<string, unknown>> };
    assert.deepEqual(status.providers.find(({ provider }) => provider === "google_drive"), {
      provider: "google_drive",
      status: "connected",
      blocker: null,
      detail: "Google Drive is ready for private Negroni filing.",
      account_email: "owner@example.test",
      folder_id: "root-negroni",
      folder_name: "Negroni",
      auto_store: true,
    });

    const markdown = "# Master Research\n\nEvidence-backed research content [SRC1].\n";
    const filingInput = {
      owner_key: ownerKey,
      run_id: "run_0123456789abcdef01234567",
      brand_id: "brand-123",
      offer_id: "offer-456",
      brand_name: "O'Brien & Sons",
      offer_name: "Emergency HVAC Leads",
      document_title: "Emergency HVAC Leads — Master Research",
      sheet_title: "Emergency HVAC Leads — Competitor Ads",
      markdown_filename: "emergency-hvac-leads-master-research.md",
      markdown,
      sources: [{ id: "SRC1", url: "https://example.test/source", title: "=1+1", accessed_at: "2026-07-31T00:00:00.000Z" }],
      competitor_collection: { status: "complete" },
      create_competitor_database: true,
    };
    const mismatchedOwner = await fetch(`http://127.0.0.1:${brokerPort}/v1/providers/google-drive/file-research`, {
      method: "POST",
      headers: { authorization: `Bearer ${brokerToken}`, "content-type": "application/json", "x-negroni-owner": "different-owner" },
      body: JSON.stringify(filingInput),
    });
    assert.equal(mismatchedOwner.status, 403);

    const response = await fetch(`http://127.0.0.1:${brokerPort}/v1/providers/google-drive/file-research`, {
      method: "POST",
      headers: { authorization: `Bearer ${brokerToken}`, "content-type": "application/json", "x-negroni-owner": ownerKey },
      body: JSON.stringify(filingInput),
    });
    assert.equal(response.status, 200, await response.clone().text());
    const receipt = await response.json() as DriveFilingReceipt;
    assert.equal(receipt.status, "verified");
    assert.equal(receipt.kind, "live");
    assert.equal(receipt.folder_name, "Negroni / O'Brien & Sons / Emergency HVAC Leads");
    assert.match(receipt.folder_url, /^https:\/\/drive\.google\.com\/drive\/folders\/folder-/);
    assert.match(receipt.google_doc.url, /^https:\/\/docs\.google\.com\/document\/d\/file-/);
    assert.match(receipt.google_sheet.url, /^https:\/\/docs\.google\.com\/spreadsheets\/d\/file-/);
    assert.equal(receipt.sole_parent_verified, true);
    assert.equal(receipt.private_access_verified, true);
    assert.deepEqual(receipt.external_actions, ["google_files_created"]);
    assert.ok([...drive.files.values()].some((file) => file.name === "emergency-hvac-leads-master-research.md" && file.content === markdown));
    assert.ok([...drive.files.values()].some((file) => file.mimeType === "application/vnd.google-apps.spreadsheet" && file.content.includes('"\'=1+1"')));

    const fileCount = drive.files.size;
    const replayResponse = await fetch(`http://127.0.0.1:${brokerPort}/v1/providers/google-drive/file-research`, {
      method: "POST",
      headers: { authorization: `Bearer ${brokerToken}`, "content-type": "application/json", "x-negroni-owner": ownerKey },
      body: JSON.stringify(filingInput),
    });
    assert.equal(replayResponse.status, 200, await replayResponse.clone().text());
    const replay = await replayResponse.json() as DriveFilingReceipt;
    assert.equal(replay.status, "verified");
    assert.equal(drive.files.size, fileCount);
    assert.deepEqual(replay.external_actions, []);

    const otherOwnerInput = {
      ...filingInput,
      owner_key: "different-owner",
      run_id: "run_111111111111111111111111",
      brand_id: "brand-other",
      offer_id: "offer-other",
    };
    const otherOwnerResponse = await fetch(`http://127.0.0.1:${brokerPort}/v1/providers/google-drive/file-research`, {
      method: "POST",
      headers: { authorization: `Bearer ${brokerToken}`, "content-type": "application/json", "x-negroni-owner": otherOwnerInput.owner_key },
      body: JSON.stringify(otherOwnerInput),
    });
    assert.equal(otherOwnerResponse.status, 200, await otherOwnerResponse.clone().text());
    const otherOwnerReceipt = await otherOwnerResponse.json() as DriveFilingReceipt;
    assert.notEqual(otherOwnerReceipt.folder_url, receipt.folder_url);

    const renamedInput = {
      ...filingInput,
      run_id: "run_abcdef0123456789abcdef01",
      brand_name: "O'Brien Home Services",
      offer_name: "Same-day HVAC Leads",
      document_title: "Same-day HVAC Leads — Master Research",
      sheet_title: "Same-day HVAC Leads — Competitor Ads",
      markdown_filename: "same-day-hvac-leads-master-research.md",
    };
    const renamedResponse = await fetch(`http://127.0.0.1:${brokerPort}/v1/providers/google-drive/file-research`, {
      method: "POST",
      headers: { authorization: `Bearer ${brokerToken}`, "content-type": "application/json", "x-negroni-owner": ownerKey },
      body: JSON.stringify(renamedInput),
    });
    assert.equal(renamedResponse.status, 200, await renamedResponse.clone().text());
    const renamed = await renamedResponse.json() as DriveFilingReceipt;
    assert.equal(renamed.folder_name, "Negroni / O'Brien Home Services / Same-day HVAC Leads");
    assert.equal(renamed.folder_url, receipt.folder_url);
    assert.equal([...drive.files.values()].filter((file) => file.mimeType === "application/vnd.google-apps.folder").length, 5);
  } finally {
    broker.kill("SIGTERM");
    await new Promise<void>((resolvePromise) => broker.once("exit", () => resolvePromise()));
    await new Promise<void>((resolvePromise, reject) => drive.server.close((error) => error ? reject(error) : resolvePromise()));
    await rm(directory, { recursive: true, force: true });
  }
});
