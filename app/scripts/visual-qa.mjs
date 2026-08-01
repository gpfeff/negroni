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
  const mobileIntegrationsNav = await page.getByRole("button", { name: "Integrations", exact: true }).boundingBox();
  const mobileSettingsNav = await page.getByRole("button", { name: "Settings", exact: true }).boundingBox();
  checks.push({
    name: "mobile navigation exposes Integrations without a hidden horizontal-scroll target",
    passed: Boolean(mobileIntegrationsNav
      && mobileSettingsNav
      && mobileIntegrationsNav.x >= 0
      && mobileIntegrationsNav.x + mobileIntegrationsNav.width <= mobileSettingsNav.x),
  });
  await page.getByRole("button", { name: "Run Research" }).first().click();
  checks.push({ name: "home enters Research", passed: await page.getByRole("heading", { name: "Create brand" }).isVisible() });
  await page.waitForFunction(() => window.scrollY === 0);
  const mobileResearchHeading = await page.getByRole("heading", { name: "Create brand" }).boundingBox();
  const mobileNavigation = await page.locator(".app-sidebar").boundingBox();
  checks.push({
    name: "mobile Research navigation lands on the unobscured page heading",
    passed: Boolean(mobileResearchHeading
      && mobileNavigation
      && mobileResearchHeading.y >= mobileNavigation.y + mobileNavigation.height
      && mobileResearchHeading.y < 844),
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  const researchTabs = page.locator(".side-nav > button.nav-active + .research-subnav");
  checks.push({ name: "Research has exactly two tabs", passed: await researchTabs.getByRole("button").count() === 2 });
  checks.push({ name: "Research tabs are Create Brand and Ad Spy", passed:
    await researchTabs.getByRole("button", { name: "Create Brand", exact: true }).count() === 1
      && await researchTabs.getByRole("button", { name: "Ad Spy", exact: true }).count() === 1,
  });
  checks.push({ name: "Research tabs use distinct icons", passed: await researchTabs.locator("svg").count() === 2 });
  for (const text of ["Create brand", "Fill in the information", "Brand information", "Profession", "Job title", "Company name", "Website or public profile URL", "Known competitors", "Industry / niche", "Location or market served", "Offer information", "Lead offer or service", "Target age range", "Create customer competitor database", "Run status"]) {
    checks.push({ name: `visible: ${text}`, passed: await page.getByText(text, { exact: false }).first().isVisible() });
  }
  for (const text of ["Client or customer name", "Service or offer purchased", "Final Gemini Deep Research prompt", "Enable ongoing monitoring", "Market awareness", "Customer psychology", "4A · Master research", "4B · Brand tone", "Nightly competitor ads"]) {
    checks.push({ name: `Research omits clutter: ${text}`, passed: await page.getByText(text, { exact: false }).count() === 0 });
  }
  checks.push({ name: "removed final-research output cards", passed: (await page.locator(".output-card").count()) === 0 });
  checks.push({ name: "Research exposes one optional database choice", passed: await page.getByRole("checkbox").count() === 1 });
  await inspect(page, "thin-client-desktop");

  await page.setViewportSize({ width: 390, height: 844 });
  await inspect(page, "thin-client-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  checks.push({ name: "Draper is removed from navigation", passed: await page.getByRole("button", { name: "Draper", exact: true }).count() === 0 });
  await page.getByRole("button", { name: "Library", exact: true }).click();
  for (const text of ["Everything made for every brand.", "Research", "Competitor ads", "Campaign files"]) {
    checks.push({ name: `Library visible: ${text}`, passed: await page.getByText(text, { exact: false }).first().isVisible() });
  }
  for (const label of ["Filter library by brand", "Filter library by offer", "Filter library by asset type", "Filter library by platform", "Filter library by status", "Filter library by date"]) {
    checks.push({ name: `Library control: ${label}`, passed: await page.getByLabel(label, { exact: true }).isVisible() });
  }
  for (const text of ["Static creative", "Video creative", "Copy & scripts"]) {
    checks.push({ name: `Library does not invent empty asset: ${text}`, passed: await page.getByRole("article").filter({ hasText: text }).count() === 0 });
  }
  await inspect(page, "library-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await inspect(page, "library-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Brands", exact: true }).click();
  checks.push({ name: "Brands explains the central brand file", passed: await page.getByText("Brands are the source of truth.", { exact: true }).isVisible() });
  await inspect(page, "brands-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await inspect(page, "brands-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const openBrandButton = page.getByRole("button", { name: "Open brand file", exact: true }).first();
  if (await openBrandButton.count()) {
    await openBrandButton.click();
    for (const text of ["Permanent brand file", "Research stays separate by offer.", "Brand library", "Research packages", "Creative assets", "Campaigns", "Learnings"]) {
      checks.push({ name: `Brand detail visible: ${text}`, passed: await page.getByText(text, { exact: false }).first().isVisible() });
    }
    await inspect(page, "brand-detail-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    await inspect(page, "brand-detail-mobile");
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await page.getByRole("button", { name: "Integrations", exact: true }).click();
  for (const text of ["Integrations", "Codex", "Claude Code", "API keys & storage", "Kie.ai API key", "Gemini API key", "Apify API token", "Google Drive", "Negroni / Brand / Offer", "Developer fallback"]) {
    checks.push({ name: `integrations visible: ${text}`, passed: await page.getByText(text, { exact: false }).first().isVisible() });
  }
  checks.push({ name: "Codex exposes one explicit connection control", passed: await page.getByRole("button", { name: /Codex/ }).count() === 1 });
  checks.push({ name: "Google Drive exposes one explicit connection control", passed: await page.getByRole("button", { name: /Google Drive/ }).count() === 1 });
  checks.push({ name: "Gemini key uses password input", passed: await page.getByLabel("Gemini API key").getAttribute("type") === "password" });
  checks.push({ name: "Apify token uses password input", passed: await page.getByLabel("Apify API token").getAttribute("type") === "password" });
  await inspect(page, "integrations-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await inspect(page, "integrations-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  for (const text of ["Settings", "Appearance & approvals", "Commit approvals"]) {
    checks.push({ name: `settings visible: ${text}`, passed: await page.getByText(text, { exact: false }).first().isVisible() });
  }
  checks.push({ name: "Settings omits provider credentials", passed: await page.getByLabel("Gemini API key").count() === 0 });
  await inspect(page, "settings-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await inspect(page, "settings-mobile");
  checks.push({ name: "no unexpected console errors", passed: consoleErrors.length === 0 });
  await context.close();
} finally {
  await browser.close();
}

const report = { generated_at: new Date().toISOString(), base_url: baseUrl, viewport_states: ["home: 1440x1000", "home: 390x844", "research: 1440x1000", "research: 390x844", "library: 1440x1000", "library: 390x844", "brands: 1440x1000", "brands: 390x844", "brand-detail: 1440x1000", "brand-detail: 390x844", "integrations: 1440x1000", "integrations: 390x844", "settings: 1440x1000", "settings: 390x844"], checks, axe: axeResults, console_errors: consoleErrors, passed: checks.every((check) => check.passed) };
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 1;
