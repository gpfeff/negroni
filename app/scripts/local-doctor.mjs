import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const checks = [
  ["Codex", "codex", ["login", "status"]],
  ["Claude Code", "claude", ["auth", "status"]],
  ["Gemini OAuth (gcloud ADC)", "gcloud", ["auth", "application-default", "print-access-token"]],
];

let blocked = false;
for (const [label, command, args] of checks) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { timeout: 8_000 });
    // `gcloud auth application-default print-access-token` writes a bearer token to stdout.
    // Report only availability so diagnostics never leak credentials.
    const summary = label === "Gemini OAuth (gcloud ADC)"
      ? "ready"
      : `${stdout}\n${stderr}`.trim().split("\n")[0] || "ready";
    console.log(`✓ ${label}: ${summary}`);
  } catch (error) {
    blocked = true;
    const missing = error?.code === "ENOENT" ? "not installed" : "login required";
    console.log(`○ ${label}: ${missing}`);
  }
}

console.log("\nAPI keys are added inside Negroni Settings and stored in ~/.negroni with owner-only permissions.");
process.exitCode = blocked ? 1 : 0;
