import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runAudit } from "../artifact-routing-audit.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "negroni-routing-"));
  const paths = { source: join(root, "artifacts"), repository: join(root, "repository"), runtime: join(root, "runtime") };
  await Promise.all(Object.values(paths).map((path) => mkdir(path, { recursive: true })));
  return { paths, lsof: async () => false };
}

async function put(root, relativePath, content) {
  const path = join(root, relativePath);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
  return path;
}

test("dry run identifies code without moving it or creating a receipt", async () => {
  const { paths, lsof } = await fixture();
  const source = await put(paths.source, "src/index.ts", "export const answer = 42;\n");
  const report = await runAudit({ paths, lsof });
  assert.equal(report.mode, "dry-run");
  assert.equal(report.events[0].action, "move");
  assert.equal(report.receiptPath, null);
  assert.equal(await readFile(source, "utf8"), "export const answer = 42;\n");
});

test("apply moves an unambiguous code file and writes provenance receipt", async () => {
  const { paths, lsof } = await fixture();
  await put(paths.source, "scripts/audit.mjs", "export {};\n");
  const report = await runAudit({ apply: true, paths, lsof, now: new Date("2026-07-29T12:00:00.000Z") });
  assert.equal(await readFile(join(paths.repository, "scripts/audit.mjs"), "utf8"), "export {};\n");
  const receipt = JSON.parse(await readFile(report.receiptPath, "utf8"));
  assert.equal(receipt.routed.length, 1);
  assert.equal(receipt.routed[0].originalPath, join(paths.source, "scripts/audit.mjs"));
  assert.equal(receipt.routed[0].destination, join(paths.repository, "scripts/audit.mjs"));
  assert.equal(receipt.routed[0].intendedDestination, join(paths.repository, "scripts/audit.mjs"));
  assert.match(receipt.routed[0].sha256, /^[a-f0-9]{64}$/);
});

test("retains durable artifacts and refuses runtime and secret-like data", async () => {
  const { paths, lsof } = await fixture();
  await put(paths.source, "reports/weekly.md", "safe report\n");
  await put(paths.source, "ROUTING-MANIFEST-2026-07-29.md", "safe routing evidence\n");
  await put(paths.source, "qa/playwright/session.yml", "generated: evidence\n");
  await put(paths.source, "conflicts/legacy/app.ts", "export const evidence = true;\n");
  await put(paths.source, "cache/state.json", "{\"value\": 1}\n");
  await put(paths.source, ".env", "API_KEY=not-a-real-secret\n");
  const report = await runAudit({ paths, lsof });
  assert.equal(report.events.find((event) => event.relativePath === "reports/weekly.md").action, "retain");
  assert.equal(report.events.find((event) => event.relativePath === "ROUTING-MANIFEST-2026-07-29.md").action, "retain");
  assert.equal(report.events.find((event) => event.relativePath === "qa/playwright/session.yml").action, "retain");
  assert.equal(report.events.find((event) => event.relativePath === "conflicts/legacy/app.ts").action, "retain");
  assert.match(report.events.find((event) => event.relativePath === "cache/state.json").reason, /runtime state/);
  assert.match(report.events.find((event) => event.relativePath === ".env").reason, /secret-like/);
  assert.equal(report.requiresHumanReview, true);
});

test("refuses a file that an injected process check reports in use", async () => {
  const { paths } = await fixture();
  await put(paths.source, "src/open.ts", "export const open = true;\n");
  const report = await runAudit({ paths, lsof: async () => true });
  assert.equal(report.events[0].action, "review");
  assert.match(report.events[0].reason, /in use/);
});

test("reports duplicate code and quarantines only a differing destination conflict", async () => {
  const { paths, lsof } = await fixture();
  await put(paths.source, "src/duplicate.ts", "export const same = true;\n");
  await put(paths.repository, "src/duplicate.ts", "export const same = true;\n");
  await put(paths.source, "src/conflict.ts", "export const source = true;\n");
  await put(paths.repository, "src/conflict.ts", "export const destination = true;\n");
  const dry = await runAudit({ paths, lsof });
  assert.equal(dry.events.find((event) => event.relativePath === "src/duplicate.ts").action, "duplicate");
  assert.equal(dry.events.find((event) => event.relativePath === "src/conflict.ts").action, "quarantine-conflict");
  const applied = await runAudit({ apply: true, paths, lsof, now: new Date("2026-07-29T12:00:00.000Z") });
  const quarantined = applied.events.find((event) => event.relativePath === "src/conflict.ts");
  assert.equal(await readFile(join(paths.repository, "src/conflict.ts"), "utf8"), "export const destination = true;\n");
  assert.equal(await readFile(quarantined.destination, "utf8"), "export const source = true;\n");
  assert.equal(quarantined.intendedDestination, join(paths.repository, "src/conflict.ts"));
  assert.equal(applied.requiresHumanReview, true);
});

test("refuses symlinks without following them", async () => {
  const { paths, lsof } = await fixture();
  const outside = await put(paths.runtime, "private.txt", "do not read\n");
  await symlink(outside, join(paths.source, "src-link.ts"));
  const report = await runAudit({ paths, lsof });
  const event = report.events.find((candidate) => candidate.relativePath === "src-link.ts");
  assert.equal(event.action, "review");
  assert.match(event.reason, /symlink/);
  assert.equal(event.sha256, null);
});

test("rejects overlapping roots before scanning files", async () => {
  const { paths, lsof } = await fixture();
  await assert.rejects(() => runAudit({ paths: { ...paths, repository: paths.source }, lsof }), /must not overlap/);
});
