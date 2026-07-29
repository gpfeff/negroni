import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const checks = [
  ["Codex", "codex", ["login", "status"], "native login is available"],
  ["Claude Code", "claude", ["auth", "status"], "native login is available"],
  ["Gemini OAuth (gcloud ADC)", "gcloud", ["auth", "application-default", "print-access-token"], "Application Default Credentials are available"],
];

let blocked = false;
for (const [label, command, args, success] of checks) {
  try {
    await execFileAsync(command, args, { timeout: 8_000 });
    console.log(`✓ ${label}: ${success}`);
  } catch (error) {
    blocked = true;
    const missing = error?.code === "ENOENT" ? "not installed" : "login required";
    console.log(`○ ${label}: ${missing}`);
  }
}

console.log("\nAPI keys are added inside Negroni Settings and stored in ~/.negroni with owner-only permissions.");
process.exitCode = blocked ? 1 : 0;
