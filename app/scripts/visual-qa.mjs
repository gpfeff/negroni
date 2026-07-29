import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");
const root = resolve(import.meta.dirname, "..");
const screenshotRoot = join(root, "qa", "screenshots");
const reportPath = join(root, "qa", "visual-qa-report.json");
const baseUrl = process.env.WORKBENCH_QA_URL ?? "http://localhost:3000";
const candidates = [process.env.WORKBENCH_CHROME_BIN, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].filter(Boolean);
const browserPath = candidates.find((candidate) => existsSync(candidate));
if (!browserPath) throw new Error("No supported Chrome executable was found for visual QA.");

await mkdir(screenshotRoot, { recursive: true });
const browser = await chromium.launch({ executablePath: browserPath, headless: true });
const checks = [];
const axeResults = [];
const consoleErrors = [];

async function inspect(page, name) {
  process.stdout.write(`Inspecting ${name}…\n`);
  await page.screenshot({ path: join(screenshotRoot, `${name}.png`), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  checks.push({ name: `${name}: no horizontal overflow`, passed: !overflow });
  await page.addScriptTag({ path: axePath });
  const result = await page.evaluate(async () => Promise.race([
    globalThis.axe.run(document, { resultTypes: ["violations"], runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Accessibility scan timed out.")), 20_000)),
  ]));
  const material = result.violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
  axeResults.push({ name, material_violations: material.map(({ id, impact, help, nodes }) => ({ id, impact, help, nodes: nodes.map(({ target, html }) => ({ target, html })) })) });
  checks.push({ name: `${name}: no serious or critical accessibility violations`, passed: material.length === 0 });
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light", reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  page.setDefaultNavigationTimeout(20_000);
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push({ text: message.text(), url: message.location().url });
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  for (const text of ["What are we making?", "Research", "Run Research", "Client", "Customer", "Competitors", "Competitor Ads", "Review & Approve", "Up next", "Campaign pipeline", "Create", "Launch", "Iterate", "Loop"]) {
    checks.push({ name: `home visible: ${text}`, passed: await page.getByText(text, { exact: false }).first().isVisible() });
  }
  await inspect(page, "home-desktop");

  await page.setViewportSize({ width: 390, height: 844 });
  await inspect(page, "home-mobile");
  await page.getByRole("button", { name: "Run Research" }).first().click();
  checks.push({ name: "home enters Research", passed: await page.getByRole("heading", { name: "Tell us the business. We’ll find the signal." }).isVisible() });

  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const text of ["Run Research", "Lead offer or service", "Industry", "Country or region", "Target age range", "Client", "Customer", "Competitors", "Market awareness", "Competitor research", "Customer psychology", "Master research", "Tone of voice", "Run status", "Nightly competitor ads", "Competitor Ads", "Outputs", "No secure five-prompt research runner", "Open Google Doc", "Open Google Sheet", "Download Markdown"]) {
    checks.push({ name: `visible: ${text}`, passed: await page.getByText(text, { exact: false }).first().isVisible() });
  }
  checks.push({ name: "exactly three output cards", passed: (await page.locator(".output-card").count()) === 3 });
  checks.push({ name: "run is disabled while execution is blocked", passed: await page.getByRole("button", { name: "Run research", exact: true }).isDisabled() });
  await inspect(page, "thin-client-desktop");

  await page.setViewportSize({ width: 390, height: 844 });
  await inspect(page, "thin-client-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Settings" }).click();
  for (const text of ["Your Negroni, your engines", "Codex", "Claude Code", "Kie.ai", "Gemini", "Google Drive", "Connections need the installed Negroni bridge"]) {
    checks.push({ name: `settings visible: ${text}`, passed: await page.getByText(text, { exact: false }).first().isVisible() });
  }
  checks.push({ name: "Codex connection disabled without broker", passed: await page.getByRole("button", { name: "Connect Codex" }).isDisabled() });
  checks.push({ name: "Google OAuth disabled without broker", passed: await page.getByRole("button", { name: "Connect Google Drive" }).isDisabled() });
  checks.push({ name: "Gemini key uses password input", passed: await page.getByLabel("Gemini API key").getAttribute("type") === "password" });
  await inspect(page, "settings-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await inspect(page, "settings-mobile");
  checks.push({ name: "no unexpected console errors", passed: consoleErrors.length === 0 });
  await context.close();
} finally {
  await browser.close();
}

const report = { generated_at: new Date().toISOString(), base_url: baseUrl, viewport_states: ["home: 1440x1000", "home: 390x844", "research: 1440x1000", "research: 390x844", "settings: 1440x1000", "settings: 390x844"], checks, axe: axeResults, console_errors: consoleErrors, passed: checks.every((check) => check.passed) };
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 1;
