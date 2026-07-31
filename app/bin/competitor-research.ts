#!/usr/bin/env node
import { runCompetitorResearchCli } from "../lib/competitor-research/runtime.ts";

const controller = new AbortController();
const interrupt = () => controller.abort();
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);
const result = await runCompetitorResearchCli(process.argv.slice(2), { signal: controller.signal });
process.removeListener("SIGINT", interrupt);
process.removeListener("SIGTERM", interrupt);
process.stdout.write(`${JSON.stringify(result.receipt)}\n`);
process.exitCode = result.exitCode;
