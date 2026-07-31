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
  await page.screenshot({ path: join(screenshotRoot, `${name}.jpg`), type: "jpeg", quality: 80, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  checks.push({ name: `${name}: no horizontal overflow`, passed: !overflow });
  const typography = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const bodySizes = [...document.querySelectorAll("p")]
      .filter((element) => visible(element) && !element.classList.contains("utility-label") && !element.classList.contains("kicker"))
      .map((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    const metadataSizes = [...document.querySelectorAll("small, .utility-label, .kicker, .next-action-status, .nav-label")]
      .filter(visible)
      .map((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    return {
      body_minimum: bodySizes.length ? Math.min(...bodySizes) : null,
      metadata_minimum: metadataSizes.length ? Math.min(...metadataSizes) : null,
    };
  });
  checks.push({ name: `${name}: operational body copy is at least 12px`, passed: typography.body_minimum === null || typography.body_minimum >= 12 });
  checks.push({ name: `${name}: metadata is at least 10px`, passed: typography.metadata_minimum === null || typography.metadata_minimum >= 10 });
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
  await page.waitForFunction(() => !document.querySelector('[data-testid="next-action-panel"]')?.textContent?.includes("Checking Research access"));
  for (const text of ["What should Negroni do next?", "Research", "Run Research", "Client", "Customer", "Competitors", "Competitor Ads", "Review & Approve"]) {
    checks.push({ name: `home visible: ${text}`, passed: await page.getByText(text, { exact: false }).first().isVisible() });
  }
  const nextActionText = await page.getByTestId("next-action-panel").innerText();
  checks.push({
    name: "home next action uses an allowed honest state title",
    passed: ["Finish Research setup", "Start Research", "Run Research", "Review limitations", "Review & Approve"].some((title) => nextActionText.includes(title)),
  });
  checks.push({ name: "home has exactly one local next-action panel", passed: await page.getByTestId("next-action-panel").count() === 1 });
  checks.push({ name: "home has exactly six Research action cards", passed: await page.locator(".research-tool-card").count() === 6 });
  checks.push({ name: "home next action exposes at most one primary action", passed: await page.getByTestId("next-action-panel").getByRole("button").count() <= 1 });
  checks.push({ name: "home omits global right rail", passed: await page.locator(".app-right-rail").count() === 0 });
  for (const text of ["This week", "Up next", "Spy on competitor ads", "winning in your niche"]) {
    checks.push({ name: `home omits unsupported copy: ${text}`, passed: await page.getByText(text, { exact: false }).count() === 0 });
  }
  checks.push({ name: "home omits redundant phase-summary cards", passed: await page.locator(".pipeline-card").count() === 0 });
  checks.push({ name: "home omits floating Negroni shortcut", passed: await page.locator(".jarvis-pill").count() === 0 });
  checks.push({
    name: "sidebar keeps appearance and approval controls inside Settings",
    passed: await page.locator(".app-sidebar").getByText("Dark mode", { exact: true }).count() === 0
      && await page.locator(".app-sidebar").getByText("Safety mode", { exact: true }).count() === 0,
  });
  await inspect(page, "home-desktop");

  await page.setViewportSize({ width: 390, height: 844 });
  const mobilePanel = await page.getByTestId("next-action-panel").boundingBox();
  const mobileBoard = await page.locator(".research-tool-board").boundingBox();
  checks.push({ name: "mobile next action stacks before Research cards", passed: Boolean(mobilePanel && mobileBoard && mobilePanel.y < mobileBoard.y) });
  checks.push({ name: "mobile retains exactly one next-action panel", passed: await page.getByTestId("next-action-panel").count() === 1 });
  await inspect(page, "home-mobile");
  await page.getByRole("button", { name: "Run Research" }).first().click();
  checks.push({ name: "home enters Research", passed: await page.getByRole("heading", { name: "Tell us the business. We’ll find the signal." }).isVisible() });

  await page.setViewportSize({ width: 1440, height: 1000 });
  checks.push({ name: "Research tools sit directly beneath the Research phase", passed: await page.locator(".side-nav > button.nav-active + .research-subnav").count() === 1 });
  for (const text of ["Run Research", "Required customer profile", "Client or customer name", "Profession or job title", "Company name", "Website or public profile URL", "Service or offer purchased", "Known competitors", "Industry / niche", "Location or market served", "Research scope", "Lead offer or service", "Target age range", "Final Gemini Deep Research prompt", "Create competitor database", "Enable ongoing monitoring", "Client", "Customer", "Competitors", "Market awareness", "Competitor research", "Customer psychology", "4A · Master research", "4B · Brand tone", "Run status", "Nightly competitor ads", "Competitor Ads", "Final research", "No secure five-prompt research runner", "Open Google Doc", "Download Markdown"]) {
    checks.push({ name: `visible: ${text}`, passed: await page.getByText(text, { exact: false }).first().isVisible() });
  }
  checks.push({ name: "exactly two final output cards", passed: (await page.locator(".output-card").count()) === 2 });
  checks.push({ name: "run is disabled while execution is blocked", passed: await page.getByRole("button", { name: "Run research", exact: true }).isDisabled() });
  const reviewEmptyContrast = await page.locator(".review-empty > div").evaluate((element) => {
    const parseColor = (value) => {
      const match = value.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)(?:[, /]+([\d.]+))?\)/);
      return match ? [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])] : null;
    };
    const composite = (foreground, background) => foreground.slice(0, 3).map((channel, index) => (
      channel * foreground[3] + background[index] * (1 - foreground[3])
    ));
    const luminance = (color) => {
      const linear = color.slice(0, 3).map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
    };
    const ratio = (foreground, background) => {
      const lighter = Math.max(luminance(foreground), luminance(background));
      const darker = Math.min(luminance(foreground), luminance(background));
      return (lighter + 0.05) / (darker + 0.05);
    };
    const paper = parseColor(getComputedStyle(element).backgroundColor);
    const heading = element.querySelector("h2");
    const paragraph = element.querySelector("p:last-child");
    if (!paper || !heading || !paragraph) return null;
    const background = composite(paper, [255, 255, 255]);
    const headingColor = parseColor(getComputedStyle(heading).color);
    const paragraphColor = parseColor(getComputedStyle(paragraph).color);
    if (!headingColor || !paragraphColor) return null;
    return {
      heading: ratio(headingColor, background),
      paragraph: ratio(paragraphColor, background),
    };
  });
  checks.push({
    name: "Research empty review text stays legible on its paper surface",
    passed: Boolean(reviewEmptyContrast && reviewEmptyContrast.heading >= 3 && reviewEmptyContrast.paragraph >= 4.5),
  });
  await inspect(page, "thin-client-desktop");

  await page.setViewportSize({ width: 390, height: 844 });
  await inspect(page, "thin-client-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Draper", exact: true }).click();
  for (const text of ["Ask Draper what the evidence says.", "Negroni conversational agent", "validated intents", "Continue in the installed Negroni plugin", "Learning Core", "Local relational database", "FTS5 + rebuildable vectors", "Fixture adapter in this milestone", "Data plane", "Knowledge plane", "Control plane"]) {
    checks.push({ name: `Draper visible: ${text}`, passed: await page.getByText(text, { exact: false }).first().isVisible() });
  }
  checks.push({ name: "Draper shows no browser-side database controls", passed: await page.locator(".draper-column").getByRole("textbox").count() === 0 });
  checks.push({ name: "Draper keeps external action boundaries visible", passed: await page.getByText("cannot publish, spend, launch traffic, change budgets, or mutate an ad account", { exact: false }).isVisible() });
  await inspect(page, "draper-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await inspect(page, "draper-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Settings" }).click();
  for (const text of ["Connect the tools behind your workspace.", "Appearance & approvals", "Commit approvals", "Codex", "Claude Code", "API keys & storage", "Kie.ai API key", "Gemini API key", "Google Drive", "Developer fallback", "Connection setup needed"]) {
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

const report = { generated_at: new Date().toISOString(), base_url: baseUrl, viewport_states: ["home: 1440x1000", "home: 390x844", "research: 1440x1000", "research: 390x844", "draper: 1440x1000", "draper: 390x844", "settings: 1440x1000", "settings: 390x844"], checks, axe: axeResults, console_errors: consoleErrors, passed: checks.every((check) => check.passed) };
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 1;
