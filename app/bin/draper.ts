#!/usr/bin/env node
import { homedir } from "node:os";
import { resolve } from "node:path";

import { DraperService, type DraperDecisionInput, type DraperQueryInput } from "../lib/learning-core/draper.ts";
import { runFixtureDraperRehearsal } from "../lib/learning-core/fixture-rehearsal.ts";
import { LearningCoreStore } from "../lib/learning-core/store.ts";

const MAX_INPUT_BYTES = 128 * 1024;
const PRIVATE_PATH_REDACTION = /(^|[\s"'=:(\[])(file:\/\/\/[^\s'"`,;}\]]+|\/(?!\/)[A-Za-z0-9._~+-][^\s'"`,;}\]]*|[A-Za-z]:\\[^\s'"`,;}\]]*)/gi;

function runtimeRoot(): string {
  const parent = process.env.NEGRONI_RUNTIME_ROOT
    ? resolve(process.env.NEGRONI_RUNTIME_ROOT)
    : resolve(homedir(), ".local/share/negroni");
  return resolve(parent, "learning-core");
}

function now(): string {
  if (process.env.NEGRONI_TEST_MODE === "1" && process.env.NEGRONI_TEST_NOW) {
    return process.env.NEGRONI_TEST_NOW;
  }
  return new Date().toISOString();
}

async function readInput(): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > MAX_INPUT_BYTES) throw new Error("Draper input exceeds 128 KiB.");
    chunks.push(bytes);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) throw new Error("Draper command requires one JSON object on standard input.");
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Draper command input must be one JSON object.");
  }
  return parsed;
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Draper command failed.";
  return message
    .replace(/\bBearer\s+\S+/gi, "[redacted-sensitive-value]")
    .replace(/\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|client[_ -]?secret)\s*[:=]\s*\S+/gi, "[redacted-sensitive-value]")
    .replace(PRIVATE_PATH_REDACTION, "$1[redacted-local-path]")
    .slice(0, 500);
}

async function main(): Promise<void> {
  const [group, action] = process.argv.slice(2).filter((argument) => argument !== "--json");
  if (group === "fixture" && action === "rehearse") {
    const result = await runFixtureDraperRehearsal({ runtimeRoot: runtimeRoot(), now: now() });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  const store = LearningCoreStore.open({ runtimeRoot: runtimeRoot(), now });
  try {
    if (group === "status" && action === undefined) {
      process.stdout.write(`${JSON.stringify(store.status())}\n`);
      return;
    }
    const draper = new DraperService(store);
    if (group === "query" && action === undefined) {
      const result = draper.query(await readInput() as DraperQueryInput);
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return;
    }
    if (group === "record-decision" && action === undefined) {
      const result = draper.recordDecision(await readInput() as DraperDecisionInput);
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return;
    }
    throw new Error("Usage: negroni draper [status|query|record-decision|fixture rehearse] --json");
  } finally {
    store.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${safeError(error)}\n`);
  process.exitCode = 1;
});
