import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");
const root = resolve(import.meta.dirname, "..");
const screenshotRoot = join(root, "qa", "screenshots");
const reportPath = join(root, "qa", "visual-qa-report.json");
const baseUrl = process.env.WORKBENCH_QA_URL ?? "http://localhost:3000";
const browserPath =
  process.env.WORKBENCH_CHROME_BIN ?? "/usr/bin/google-chrome";

await mkdir(screenshotRoot, { recursive: true });

const browser = await chromium.launch({
  executablePath: browserPath,
  headless: true,
  args: ["--disable-dev-shm-usage"],
});
const consoleErrors = [];
const checks = [];
const axeResults = [];

async function capture(page, name) {
  await page.screenshot({
    path: join(screenshotRoot, `${name}.png`),
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  checks.push({ name: `${name}: horizontal viewport overflow`, passed: !overflow });
}

async function expectText(page, text, name) {
  const visible = await page.getByText(text, { exact: false }).first().isVisible();
  checks.push({ name, passed: visible });
  if (!visible) throw new Error(`Expected visible text: ${text}`);
}

async function runAxe(page, name) {
  await page.addScriptTag({ path: axePath });
  const result = await page.evaluate(async () => {
    const axe = globalThis.axe;
    return axe.run(document, {
      resultTypes: ["violations"],
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
    });
  });
  const material = result.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact),
  );
  axeResults.push({
    name,
    material_violations: material.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        html: node.html,
      })),
    })),
  });
  checks.push({
    name: `${name}: no serious or critical axe violations`,
    passed: material.length === 0,
  });
}

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await context.addInitScript(() => localStorage.clear());
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push({
        text: message.text(),
        url: message.location().url,
      });
    }
  });
  page.on("pageerror", (error) =>
    consoleErrors.push({ text: error.message, url: page.url() }),
  );

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await expectText(page, "Synthetic — Community Workshop Inquiries", "fixture visible");
  await expectText(page, "Lead buyer", "buyer summary visible");
  await expectText(page, "Lead consumer", "consumer summary visible");
  await capture(page, "dashboard-desktop");
  await runAxe(page, "dashboard desktop");

  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expectText(page, "Guided intake", "intake opened");
  await capture(page, "intake-desktop");

  await page
    .locator(".wizard-steps button")
    .filter({ hasText: "Lead product" })
    .click();
  await expectText(page, "Specify the lead product", "lead product step opened");

  await page.locator(".nav-item").filter({ hasText: "Sources" }).click();
  await expectText(page, "Register evidence by role", "sources opened");
  await capture(page, "sources-desktop");

  await page.locator(".nav-item").filter({ hasText: "Preflight" }).click();
  await expectText(page, "Ready to research", "preflight passed");
  await expectText(page, "External-action allowlist", "allowlist visible");
  await capture(page, "preflight-desktop");

  await page.locator(".nav-item").filter({ hasText: "Run" }).click();
  await page
    .getByRole("button", { name: "Run synthetic demonstration", exact: true })
    .click();
  await expectText(page, "SYNTHETIC DEMONSTRATION", "fixture run labeled");
  await capture(page, "run-desktop");
  await runAxe(page, "run desktop");

  await page.locator(".nav-item").filter({ hasText: "Evidence" }).click();
  await expectText(page, "Evidence ledger", "evidence ledger opened");
  const audienceFilter = page.getByLabel("Audience side");
  await audienceFilter.selectOption("buyer");
  await expectText(page, "1 of 3 records", "evidence filter applied");
  await capture(page, "evidence-desktop");
  await runAxe(page, "evidence desktop");

  await page.locator(".nav-item").filter({ hasText: "Deliverables" }).click();
  await expectText(page, "2/10", "representative markdown count");
  await expectText(page, "Not created", "document manifest not fabricated");
  await expectText(page, "0/10", "native docs and parity remain zero");
  await capture(page, "deliverables-desktop");
  await runAxe(page, "deliverables desktop");

  await page.keyboard.press("Tab");
  const focusVisible = await page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || active === document.body) return false;
    const style = getComputedStyle(active);
    return style.outlineStyle !== "none" || style.boxShadow !== "none";
  });
  checks.push({ name: "keyboard focus is visible", passed: focusVisible });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open project dashboard" }).click();
  await capture(page, "dashboard-mobile");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await capture(page, "intake-mobile");
  await page.locator(".nav-item").filter({ hasText: "Deliverables" }).click();
  await capture(page, "deliverables-mobile");
  await runAxe(page, "deliverables mobile");

  const materialConsoleErrors = consoleErrors.filter(
    (entry) =>
      !(
        entry.url === "http://127.0.0.1:4317/health" &&
        entry.text.includes("ERR_CONNECTION_REFUSED")
      ),
  );
  checks.push({
    name: "no unexpected browser console errors",
    passed: materialConsoleErrors.length === 0,
  });
  await context.close();
} finally {
  await browser.close();
}

const report = {
  generated_at: new Date().toISOString(),
  base_url: baseUrl,
  viewport_states: ["1440x1000", "390x844"],
  checks,
  axe: axeResults,
  console_errors: consoleErrors,
  expected_optional_runtime_probe_errors: consoleErrors.filter(
    (entry) => entry.url === "http://127.0.0.1:4317/health",
  ),
  passed: checks.every((check) => check.passed),
};

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 1;
