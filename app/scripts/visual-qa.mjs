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
const viewportStates = [];

const qaProfile = {
  id: "qa-offer-1",
  brand_id: "qa-brand-1",
  profession: "HVAC contractor",
  job_title: "Operations director",
  company_name: "Reference Home Services",
  website_or_public_profile_url: "https://example.com",
  competitor_used: "Example Competitor",
  offer_or_lead_type: "Seasonal HVAC tune-up",
  industry: "Home services",
  country_region: "Phoenix, Arizona",
  target_age_range: "30–60",
  created_at: "2026-01-15T12:00:00.000Z",
  updated_at: "2026-07-15T12:00:00.000Z",
  latest_run: null,
};

const qaReview = {
  available: true,
  ai_available: false,
  workspace: {
    profile_id: qaProfile.id,
    status: "approved",
    current_revision_id: "qa-revision-1",
    approved_revision_id: "qa-revision-1",
    approved_seed_sha256: "a".repeat(64),
    latest_run_id: null,
    created_at: "2026-07-15T12:00:00.000Z",
    updated_at: "2026-07-15T12:00:00.000Z",
  },
  revisions: [{
    id: "qa-revision-1",
    profile_id: qaProfile.id,
    revision_number: 1,
    parent_revision_id: null,
    origin: "manual_edit",
    status: "accepted",
    markdown_content: "# Reference research seed\n\nSanitized evidence, audience language, offer constraints, competitor patterns, and explicit unknowns for visual quality assurance.",
    change_summary: "Created the sanitized QA research seed.",
    created_at: "2026-07-15T12:00:00.000Z",
  }],
  messages: [],
  blocker: null,
};

async function inspect(page, name) {
  process.stdout.write(`Inspecting ${name}…\n`);
  const viewport = page.viewportSize();
  viewportStates.push(`${name}: ${viewport?.width ?? "unknown"}x${viewport?.height ?? "unknown"}`);
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
  if (!await page.evaluate(() => Boolean(globalThis.axe))) await page.addScriptTag({ path: axePath });
  const result = await page.evaluate(async () => Promise.race([
    globalThis.axe.run(document, { resultTypes: ["violations"], runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Accessibility scan timed out.")), 20_000)),
  ]));
  const material = result.violations.filter((violation) => ["moderate", "serious", "critical"].includes(violation.impact));
  axeResults.push({ name, material_violations: material.map(({ id, impact, help, nodes }) => ({ id, impact, help, nodes: nodes.map(({ target, html }) => ({ target, html })) })) });
  checks.push({ name: `${name}: no moderate, serious, or critical accessibility violations`, passed: material.length === 0 });
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light", reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  page.setDefaultNavigationTimeout(20_000);
  await page.route("**/api/profiles", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ available: true, records: [qaProfile], blocker: null }) });
  });
  await page.route(/\/api\/review\?/, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(qaReview) });
  });
  await page.route("**/api/run", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ available: false, status: "blocked", blocker: "The secure Research runner is not configured in this QA environment." }) });
  });
  await page.route("**/api/settings", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const providers = ["codex_cli", "claude_code", "gemini_api", "gemini_oauth", "kie_ai", "apify", "google_drive"].map((provider) => ({ provider, status: "not_connected", blocker: "Not connected in visual QA.", detail: null }));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ available: true, providers, blocker: null }) });
  });
  await page.route("**/api/connections/gemini", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "not_connected", last_verified_at: null, fingerprint: null, last_four: null }) });
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push({ text: message.text(), url: message.location().url });
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  await page.waitForFunction(() => !document.querySelector('[data-testid="next-action-panel"]')?.textContent?.includes("Checking Research access"));
  for (const text of ["Your campaign workspace", "Research", "Run Research", "Client", "Customer", "Competitors", "Competitor Ads", "Review & Approve"]) {
    checks.push({ name: `home visible: ${text}`, passed: await page.getByText(text, { exact: false }).first().isVisible() });
  }
  const nextActionText = await page.getByTestId("next-action-panel").innerText();
  checks.push({
    name: "home next action uses an allowed honest state title",
    passed: ["Finish Research setup", "Start Research", "Run Research", "Review limitations", "Review & Approve"].some((title) => nextActionText.includes(title)),
  });
  checks.push({ name: "home has exactly one local next-action panel", passed: await page.getByTestId("next-action-panel").count() === 1 });
  checks.push({ name: "home has exactly six Research action cards", passed: await page.locator(".research-tool-card").count() === 6 });
  checks.push({ name: "home omits decorative workflow illustrations", passed: await page.locator(".research-tool-card .tool-visual").count() === 0 });
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
  const mobileNavigationState = await page.locator(".side-nav").evaluate((navigation) => ({
    phaseButtons: [...navigation.querySelectorAll("button")]
      .filter((button) => ["Research", "Create", "Launch", "Iterate", "Loop"].some((phase) => button.textContent?.includes(phase)))
      .map((button) => ({ label: button.textContent?.trim(), display: getComputedStyle(button).display, height: button.getBoundingClientRect().height })),
    active: navigation.querySelector("button[aria-current='page']")?.textContent ?? null,
  }));
  const mobileSettingsNav = await page.getByRole("button", { name: "Settings", exact: true }).boundingBox();
  checks.push({
    name: "mobile navigation retains all five campaign phases",
    passed: mobileNavigationState.phaseButtons.length === 5
      && mobileNavigationState.phaseButtons.every(({ display, height }) => display !== "none" && height >= 44),
  });
  checks.push({ name: "mobile navigation exposes one current page", passed: mobileNavigationState.active?.includes("Home") === true });
  checks.push({ name: "mobile keeps Settings as a 44px pinned target", passed: Boolean(mobileSettingsNav && mobileSettingsNav.height >= 44 && mobileSettingsNav.x + mobileSettingsNav.width <= 390) });
  await page.locator(".side-nav > button").filter({ hasText: "Create" }).click();
  checks.push({ name: "Create blocks an unscoped draft before an offer is selected", passed: await page.getByRole("heading", { name: "Choose an offer before Create", exact: true }).isVisible() && await page.getByRole("button", { name: "Review Research", exact: true }).isVisible() });
  await page.locator(".side-nav > button").filter({ hasText: "Home" }).click();
  await page.getByRole("button", { name: "Run Research" }).first().click();
  checks.push({ name: "home enters Research", passed: await page.getByRole("heading", { name: "Brand setup" }).isVisible() });
  await page.waitForFunction(() => window.scrollY === 0);
  const mobileResearchHeading = await page.getByRole("heading", { name: "Brand setup" }).boundingBox();
  const mobileNavigation = await page.locator(".app-sidebar").boundingBox();
  checks.push({
    name: "mobile Research navigation lands on the unobscured page heading",
    passed: Boolean(mobileResearchHeading
      && mobileNavigation
      && mobileResearchHeading.y >= mobileNavigation.y + mobileNavigation.height
      && mobileResearchHeading.y < 844),
  });
  await page.getByLabel("Brand", { exact: true }).selectOption(qaProfile.id);
  await page.waitForFunction((expected) => document.querySelector("#company-name")?.value === expected, qaProfile.company_name);

  await page.setViewportSize({ width: 1440, height: 1000 });
  const researchTabs = page.locator(".side-nav > button.nav-active + .research-subnav");
  checks.push({ name: "Research has exactly two tabs", passed: await researchTabs.getByRole("button").count() === 2 });
  checks.push({ name: "Research tabs are Create Brand and Ad Spy", passed:
    await researchTabs.getByRole("button", { name: "Create Brand", exact: true }).count() === 1
      && await researchTabs.getByRole("button", { name: "Ad Spy", exact: true }).count() === 1,
  });
  checks.push({ name: "Research tabs use distinct icons", passed: await researchTabs.locator("svg").count() === 2 });
  for (const text of ["Brand setup", "Fill in the information", "Brand", "Profession", "Job title", "Company name", "Website or public profile URL", "Known competitors", "Industry / niche", "Location or market served", "Offer", "Lead offer or service", "Target age range", "Create customer competitor database", "Run status"]) {
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

  const researchDestinations = [
    ["Client", "client", "#intake"],
    ["Customer", "customer", "#offer-type"],
    ["Competitors", "competitors", "#competitor-used"],
  ];
  for (const [label, tool, target] of researchDestinations) {
    await page.locator(".side-nav > button").filter({ hasText: "Home" }).click();
    await page.locator(".research-tool-card").filter({ hasText: label }).click();
    checks.push({
      name: `${label} card opens a real Research destination`,
      passed: new URL(page.url()).searchParams.get("tool") === tool && await page.locator(target).isVisible(),
    });
  }

  await page.locator(".side-nav > button").filter({ hasText: "Home" }).click();
  await page.locator(".research-tool-card").filter({ hasText: "Competitor Ads" }).click();
  checks.push({ name: "Ad Spy opens a truthful evidence state", passed: await page.getByRole("heading", { name: "Ad Spy", exact: true }).isVisible() && await page.getByText("No competitor-ad evidence yet.", { exact: true }).isVisible() });
  await inspect(page, "ad-spy-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await inspect(page, "ad-spy-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.locator(".side-nav > button").filter({ hasText: "Home" }).click();
  await page.locator(".research-tool-card").filter({ hasText: "Review & Approve" }).click();
  checks.push({ name: "Review & Approve opens the approved revision workspace", passed: await page.getByRole("heading", { name: "Shape what Phase 2 will believe.", exact: true }).isVisible() && await page.getByText("Approved for Phase 2", { exact: true }).isVisible() });
  await inspect(page, "research-review-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await inspect(page, "research-review-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.locator(".side-nav > button").filter({ hasText: "Create" }).click();
  checks.push({ name: "Create opens only from the approved Research handoff", passed: await page.getByLabel("Funnel name").isVisible() && await page.getByText("Approved Research v1", { exact: true }).isVisible() });
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  const storedDraftKeys = await page.evaluate(() => Object.keys(window.localStorage).filter((key) => key.startsWith("negroni.quiz-funnel.lead-capture")));
  checks.push({
    name: "Create stores the draft under the selected offer and approved fingerprint",
    passed: storedDraftKeys.length === 1
      && storedDraftKeys[0].includes("qa-offer-1.qa-revision-1")
      && !storedDraftKeys.includes("negroni.quiz-funnel.lead-capture.v1"),
  });
  await inspect(page, "create-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await inspect(page, "create-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const workflowPhaseChecks = {
    Launch: ["Launch setup is not connected", "Open Create", "creative-manifest.json"],
    Iterate: ["Iteration setup is not connected", "Open Launch", "launch-receipt.json"],
    Loop: ["Loop setup is not connected", "Open Iterate", "experiment-result.json"],
  };
  for (const phase of ["Launch", "Iterate", "Loop"]) {
    await page.locator(".side-nav > button").filter({ hasText: phase }).click();
    const [stateTitle, actionLabel, handoffArtifact] = workflowPhaseChecks[phase];
    checks.push({ name: `${phase} truthfully reports unavailable verification`, passed: await page.getByRole("heading", { name: phase, exact: true }).isVisible() && await page.getByRole("heading", { name: stateTitle, exact: true }).isVisible() && await page.getByRole("button", { name: actionLabel, exact: true }).isVisible() && await page.getByText(handoffArtifact, { exact: true }).isVisible() });
    await inspect(page, `${phase.toLowerCase()}-desktop`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(100);
    const activePhaseBounds = await page.locator(".side-nav > button[aria-current='page']").boundingBox();
    const navigationBounds = await page.locator(".side-nav").boundingBox();
    checks.push({
      name: `${phase} remains the visible current phase on mobile`,
      passed: Boolean(activePhaseBounds && navigationBounds
        && activePhaseBounds.x >= navigationBounds.x
        && activePhaseBounds.x + activePhaseBounds.width <= navigationBounds.x + navigationBounds.width),
    });
    await inspect(page, `${phase.toLowerCase()}-mobile`);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  checks.push({ name: "Draper is removed from navigation", passed: await page.getByRole("button", { name: "Draper", exact: true }).count() === 0 });
  await page.getByRole("button", { name: "Library", exact: true }).click();
  for (const text of ["Campaign files"]) {
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
  checks.push({ name: "Brands shows the brand-file workspace", passed: await page.getByText("Brand files", { exact: true }).isVisible() });
  await inspect(page, "brands-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await inspect(page, "brands-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const openBrandButton = page.getByRole("button", { name: "Open brand file", exact: true }).first();
  checks.push({ name: "sanitized QA fixture always exposes Brand detail", passed: await openBrandButton.count() === 1 });
  await openBrandButton.click();
  for (const text of ["Permanent brand file", "Research stays separate by offer.", "Brand library", "Research packages", "Creative assets", "Campaigns", "Learnings"]) {
    checks.push({ name: `Brand detail visible: ${text}`, passed: await page.getByText(text, { exact: false }).first().isVisible() });
  }
  await inspect(page, "brand-detail-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await inspect(page, "brand-detail-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Integrations", exact: true }).click();
  for (const text of ["Integrations", "API keys & storage", "Kie.ai API key", "Gemini API key", "Apify API token", "Google Drive", "Negroni / Brand / Offer", "Advanced connections", "Developer setup"]) {
    checks.push({ name: `integrations visible: ${text}`, passed: await page.getByText(text, { exact: false }).first().isVisible() });
  }
  checks.push({ name: "advanced agent controls are hidden by default", passed: await page.getByRole("button", { name: /Codex/ }).count() === 0 });
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
  checks.push({ name: "Settings exposes selected controls to assistive technology", passed: await page.getByRole("button", { name: "Dark", exact: true }).getAttribute("aria-pressed") === "true" && await page.getByRole("button", { name: "Safety", exact: true }).getAttribute("aria-pressed") === "true" });
  await inspect(page, "settings-desktop");

  await page.getByRole("button", { name: "Light", exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
  await inspect(page, "settings-light-desktop");
  await page.locator(".side-nav > button").filter({ hasText: "Home" }).click();
  await inspect(page, "home-light-desktop");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.emulateMedia({ colorScheme: "light" });
  await page.getByRole("button", { name: "System", exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
  checks.push({ name: "System appearance follows a light operating-system preference", passed: await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme === "light") });
  await inspect(page, "settings-system-light-desktop");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  checks.push({ name: "System appearance follows a dark operating-system preference", passed: await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme === "dark") });
  await page.setViewportSize({ width: 390, height: 844 });
  await inspect(page, "settings-mobile");
  checks.push({ name: "no unexpected console errors", passed: consoleErrors.length === 0 });
  await context.close();
} finally {
  await browser.close();
}

const report = { generated_at: new Date().toISOString(), base_url: baseUrl, viewport_states: viewportStates, checks, axe: axeResults, console_errors: consoleErrors, passed: checks.every((check) => check.passed) };
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 1;
