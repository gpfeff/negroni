#!/usr/bin/env node
/**
 * Safely audit the Documents Negroni artifact workspace. The default mode is
 * read-only; --apply moves only clear, non-sensitive code files or preserves a
 * differing destination in a timestamped conflict quarantine.
 */
import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, opendir, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_PATHS = {
  source: resolve(homedir(), "Documents/tools-negroni"),
  repository: REPOSITORY_ROOT,
  runtime: resolve(homedir(), ".local/share/negroni"),
};

const CODE_EXTENSIONS = new Set([".c", ".cc", ".css", ".go", ".html", ".java", ".js", ".json", ".jsx", ".mjs", ".mts", ".php", ".py", ".rb", ".rs", ".sh", ".sql", ".toml", ".ts", ".tsx", ".vue", ".yaml", ".yml"]);
const CODE_NAMES = new Set(["dockerfile", "makefile", "package-lock.json", "package.json", "pnpm-lock.yaml", "tsconfig.json", "vite.config.ts", "wrangler.toml"]);
const CODE_SEGMENTS = new Set([".github", "app", "assets", "bin", "ci", "components", "db", "docs", "drizzle", "lib", "migrations", "public", "schemas", "scripts", "src", "test", "tests", "worker"]);
const ARTIFACT_SEGMENTS = new Set(["archives", "conflicts", "exports", "generated-deliverables", "handoffs", "migration-evidence", "qa", "receipts", "reports", "research", "review-packets"]);
const RUNTIME_SEGMENTS = new Set(["cache", "caches", "collected-media", "database", "databases", "logs", "media", "runtime", "state", "tmp"]);
const PRIVATE_NAME = /(?:^|[._-])(customer|client|contact|cookie|credential|database|db|email|lead|person|pii|private|token|secret)(?:[._-]|$)/i;
const SECRET_NAME = /(^|[._-])(?:\.env|auth|credential|cookie|key|passwd|password|secret|token)(?:[._-]|$)/i;
const SECRET_CONTENT = /-----BEGIN [A-Z ]+PRIVATE KEY-----|(?:api[_-]?key|access[_-]?token|client[_-]?secret|authorization)\s*[:=]\s*[^\s"']{8,}|aws_secret_access_key\s*=/i;
const PRIVATE_CONTENT = /(?:\b\d[ -]*?){13,16}\b|\b\d{3}-\d{2}-\d{4}\b|(?:customer|client|lead)[^\n]{0,60}(?:email|phone|address)/i;

function isoStamp(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, "-");
}

function pathInside(parent, candidate) {
  const rel = relative(resolve(parent), resolve(candidate));
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== "..");
}

function portableRelative(root, target) {
  const value = relative(root, target);
  if (!value || value.startsWith(`..${sep}`) || value === ".." || isAbsolute(value)) {
    throw new Error(`Refusing path outside source root: ${target}`);
  }
  return value.split(sep).join("/");
}

export async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

export function classify(relativePath) {
  const parts = relativePath.toLowerCase().split("/");
  const name = basename(relativePath).toLowerCase();
  if (name === "agents.md" || /^(?:negroni-file-boundary-setup-prompts|routing-manifest-.+)\.md$/i.test(name) || parts.some((part) => ARTIFACT_SEGMENTS.has(part))) return "artifact";
  if (parts.some((part) => RUNTIME_SEGMENTS.has(part)) || [".db", ".sqlite", ".sqlite3", ".log"].includes(extname(name))) return "runtime";
  if (parts.some((part) => CODE_SEGMENTS.has(part)) || CODE_EXTENSIONS.has(extname(name)) || CODE_NAMES.has(name)) return "code";
  return "unknown";
}

async function contentRisk(filePath, stat) {
  const nameRisk = SECRET_NAME.test(basename(filePath)) ? "secret-like filename" : PRIVATE_NAME.test(basename(filePath)) ? "suspected private-data filename" : null;
  if (nameRisk) return nameRisk;
  if (stat.size > 1_000_000) return null;
  const sample = await readFile(filePath, "utf8").catch(() => "");
  if (SECRET_CONTENT.test(sample)) return "secret-like content";
  if (PRIVATE_CONTENT.test(sample)) return "suspected private content";
  return null;
}

async function inUse(filePath, lsof = defaultLsof) {
  try {
    return await lsof(filePath);
  } catch {
    // lsof may be unavailable; a move is only allowed when callers explicitly
    // provide an availability-safe checker in tests or the command is present.
    return true;
  }
}

function defaultLsof(filePath) {
  return new Promise((resolveUse, rejectUse) => {
    const child = spawn("lsof", ["-F", "n", "--", filePath], { stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.once("error", rejectUse);
    child.once("close", (code) => {
      if (code === 0) resolveUse(output.trim().length > 0);
      else if (code === 1) resolveUse(false);
      else rejectUse(new Error(`lsof exited ${code}`));
    });
  });
}

async function listFiles(root) {
  const result = [];
  async function walk(current) {
    const directory = await opendir(current);
    for await (const entry of directory) {
      const candidate = join(current, entry.name);
      const stat = await lstat(candidate);
      if (stat.isSymbolicLink() || stat.isFile()) result.push({ path: candidate, stat });
      else if (stat.isDirectory()) await walk(candidate);
    }
  }
  try {
    await walk(root);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return result.sort((a, b) => a.path.localeCompare(b.path));
}

function destinationFor(kind, relativePath, paths) {
  if (kind === "code") return join(paths.repository, relativePath);
  if (kind === "runtime") return join(paths.runtime, relativePath);
  return null;
}

async function evaluateFile(file, paths, lsof) {
  const relativePath = portableRelative(paths.source, file.path);
  const kind = classify(relativePath);
  const destination = destinationFor(kind, relativePath, paths);
  const event = { originalPath: file.path, relativePath, kind, sha256: null, destination, intendedDestination: destination, action: "retain", reason: "durable artifact" };
  if (file.stat.isSymbolicLink()) return { ...event, action: "review", reason: "symlink; audit never follows symlinks", humanReview: true };
  event.sha256 = await sha256(file.path);
  const risk = await contentRisk(file.path, file.stat);
  if (risk) return { ...event, action: "review", reason: risk, humanReview: true };
  if (kind === "artifact") return event;
  if (kind === "unknown") return { ...event, action: "review", reason: "unclassified file", humanReview: true };
  if (kind === "runtime") return { ...event, action: "review", reason: "runtime state is treated as suspected private data", humanReview: true };
  if (await inUse(file.path, lsof)) return { ...event, action: "review", reason: "file appears in use or lsof is unavailable", humanReview: true };
  try {
    const destinationStat = await lstat(event.destination);
    if (!destinationStat.isFile()) return { ...event, action: "conflict", reason: "destination exists and is not a regular file", humanReview: true };
    const destinationHash = await sha256(event.destination);
    if (destinationHash === event.sha256) return { ...event, action: "duplicate", reason: "same SHA-256 already exists at destination", humanReview: true };
    return { ...event, action: "quarantine-conflict", reason: "destination has different SHA-256", humanReview: true };
  } catch (error) {
    if (error?.code === "ENOENT") return { ...event, action: "move", reason: "code file has no destination conflict", humanReview: false };
    throw error;
  }
}

async function exclusiveMove(source, destination, expectedHash) {
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination, fsConstants.COPYFILE_EXCL);
  const [sourceHash, destinationHash] = await Promise.all([sha256(source), sha256(destination)]);
  if (sourceHash !== expectedHash || destinationHash !== expectedHash) {
    throw new Error(`Source changed during routing: ${source}`);
  }
  await unlink(source);
}

async function writeReceipt(paths, report) {
  const receiptDirectory = join(paths.source, "receipts");
  await mkdir(receiptDirectory, { recursive: true });
  const receiptPath = join(receiptDirectory, `routing-audit-${isoStamp(new Date(report.timestamp))}.json`);
  const receipt = {
    type: "negroni-file-routing-receipt",
    timestamp: report.timestamp,
    mode: report.mode,
    routed: report.events.filter((event) => event.applied).map(({ originalPath, destination, intendedDestination, timestamp, reason, sha256: hash, action }) => ({ originalPath, destination, intendedDestination, timestamp, reason, sha256: hash, action })),
    reviewItems: report.events.filter((event) => event.humanReview).map(({ originalPath, destination, intendedDestination, reason, sha256: hash, action }) => ({ originalPath, destination, intendedDestination, reason, sha256: hash, action })),
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  return receiptPath;
}

export async function runAudit(options = {}) {
  const paths = { ...DEFAULT_PATHS, ...options.paths };
  paths.source = resolve(paths.source);
  paths.repository = resolve(paths.repository);
  paths.runtime = resolve(paths.runtime);
  const roots = [paths.source, paths.repository, paths.runtime];
  if (roots.some((root, index) => roots.some((other, otherIndex) => index !== otherIndex && pathInside(root, other)))) {
    throw new Error("Synced source, repository, and runtime roots must not overlap");
  }
  const mode = options.apply ? "apply" : "dry-run";
  const timestamp = (options.now ?? new Date()).toISOString();
  const files = await listFiles(paths.source);
  const events = [];
  for (const file of files) {
    if (portableRelative(paths.source, file.path).startsWith("quarantine/routing-conflicts/")) continue;
    events.push(await evaluateFile(file, paths, options.lsof));
  }
  const report = { type: "negroni-file-routing-audit", mode, timestamp, paths, events, receiptPath: null, requiresHumanReview: events.some((event) => event.humanReview) };
  if (!options.apply) return report;
  for (const event of events) {
    if (event.action === "move") {
      await exclusiveMove(event.originalPath, event.destination, event.sha256);
      event.applied = true;
      event.timestamp = timestamp;
    } else if (event.action === "quarantine-conflict") {
      const quarantine = join(paths.source, "quarantine", "routing-conflicts", isoStamp(new Date(timestamp)), event.relativePath);
      await exclusiveMove(event.originalPath, quarantine, event.sha256);
      event.destination = quarantine;
      event.applied = true;
      event.timestamp = timestamp;
      event.reason = "preserved differing destination in timestamped quarantine";
    }
  }
  report.receiptPath = await writeReceipt(paths, report);
  return report;
}

function parseArgs(args) {
  const parsed = { apply: false, paths: {} };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--apply") parsed.apply = true;
    else if (["--source", "--repository", "--runtime"].includes(arg)) parsed.paths[arg.slice(2)] = args[++index];
    else if (arg === "--help") parsed.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

export function formatReport(report) {
  const lines = [`Negroni routing audit: ${report.mode}`, `Source: ${report.paths.source}`];
  for (const event of report.events) lines.push(`${event.action.toUpperCase()} ${event.relativePath} — ${event.reason}${event.destination ? ` → ${event.destination}` : ""}`);
  lines.push(`Summary: ${report.events.length} file(s); human review ${report.requiresHumanReview ? "required" : "not required"}.`);
  if (report.receiptPath) lines.push(`Receipt: ${report.receiptPath}`);
  return lines.join("\n");
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    console.log("Usage: node tools/artifact-routing-audit.mjs [--apply] [--source PATH] [--repository PATH] [--runtime PATH]");
    return;
  }
  const report = await runAudit(parsed);
  console.log(formatReport(report));
  if (report.requiresHumanReview) process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Routing audit failed: ${error.message}`);
    process.exitCode = 1;
  });
}
