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
  for (const text of ["Intake", "Run status", "Nightly competitor ads", "Outputs", "No secure canonical-skill runner", "Open Google Doc", "Open Google Sheet", "Download Markdown"]) {
    checks.push({ name: `visible: ${text}`, passed: await page.getByText(text, { exact: false }).first().isVisible() });
  }
  checks.push({ name: "exactly three output cards", passed: (await page.locator(".output-card").count()) === 3 });
  checks.push({ name: "run is disabled while execution is blocked", passed: await page.getByRole("button", { name: "Run intelligence research" }).isDisabled() });
  await page.getByText("Add more detail", { exact: true }).click();
  checks.push({ name: "progressive detail opens on-page", passed: await page.getByLabel("Offer or service answer status").isVisible() });
  await page.getByText("Add more detail", { exact: true }).click();
  await inspect(page, "thin-client-desktop");

  await page.setViewportSize({ width: 390, height: 844 });
  await inspect(page, "thin-client-mobile");
  checks.push({ name: "no unexpected console errors", passed: consoleErrors.length === 0 });
  await context.close();
} finally {
  await browser.close();
}

const report = { generated_at: new Date().toISOString(), base_url: baseUrl, viewport_states: ["1440x1000", "390x844"], checks, axe: axeResults, console_errors: consoleErrors, passed: checks.every((check) => check.passed) };
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 1;
