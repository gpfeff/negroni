#!/usr/bin/env node

import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { validateVisibleCapture } = require("./capture-core.js");

const input = process.argv[2];
if (!input || process.argv.length !== 3) {
  process.stderr.write("Usage: node validate-capture.mjs /path/to/negroni-meta-visible.json\n");
  process.exitCode = 64;
} else {
  try {
    const payload = JSON.parse(await readFile(resolve(input), "utf8"));
    const summary = validateVisibleCapture(payload);
    process.stdout.write(`${JSON.stringify({ valid: true, ...summary }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Capture validation failed."}\n`);
    process.exitCode = 2;
  }
}
