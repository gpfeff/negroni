#!/usr/bin/env node
import { createServer } from "node:http";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { createDefaultResearchRunnerDependencies } from "../lib/research-runner/defaults.ts";
import {
  createResearchRunner,
  createResearchRunnerHandler,
} from "../lib/research-runner/runtime.ts";

const token = process.env.NEGRONI_RUNNER_TOKEN?.trim() ?? "";
const port = Number(process.env.NEGRONI_RUNNER_PORT ?? "47832");
if (token.length < 16) throw new Error("NEGRONI_RUNNER_TOKEN must be supplied by the server-side secret store.");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("NEGRONI_RUNNER_PORT must be an unprivileged TCP port.");

const runner = createResearchRunner({
  repository_root: resolve(import.meta.dirname, "../.."),
  runtime_root: resolve(process.env.NEGRONI_RUNTIME_ROOT?.trim() || homedir(), process.env.NEGRONI_RUNTIME_ROOT?.trim() ? "" : ".local/share/negroni"),
  artifact_root: resolve(process.env.NEGRONI_ARTIFACT_ROOT?.trim() || homedir(), process.env.NEGRONI_ARTIFACT_ROOT?.trim() ? "" : "Documents/tools-negroni"),
  dependencies: createDefaultResearchRunnerDependencies(),
});
const handle = createResearchRunnerHandler({ runner, service_token: token });

const server = createServer(async (request, response) => {
  try {
    const origin = `http://${request.headers.host || `127.0.0.1:${port}`}`;
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
      else if (value !== undefined) headers.set(name, value);
    }
    const init: RequestInit & { duplex: "half" } = {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD"
        ? undefined
        : request as unknown as BodyInit,
      duplex: "half",
    };
    const result = await handle(new Request(new URL(request.url || "/", origin), init));
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch {
    response.writeHead(500, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ status: "failed", error: "The secure runner failed closed." }));
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Negroni secure runner is listening on loopback port ${port}.\n`);
});
