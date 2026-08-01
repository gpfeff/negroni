import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

test("the Research UI presents a lean permanent-brand flow", async () => {
  const source = await readFile(resolve(process.cwd(), "components/intelligence-client.tsx"), "utf8");
  const profileStart = source.indexOf("<h3>Brand information</h3>");
  const scopeStart = source.indexOf("<h3>Offer information</h3>", profileStart);
  const requiredLabels = [
    "Profession",
    "Job title",
    "Company name",
    "Website or public profile URL",
    "Industry / niche",
    "Location or market served",
  ];

  assert.ok(profileStart >= 0, "missing the brand-information section");
  assert.ok(scopeStart > profileStart, "offer information must follow the brand foundation");
  const profileSection = source.slice(profileStart, scopeStart);
  for (const label of requiredLabels) {
    assert.ok(profileSection.includes(`>${label} <strong>Required</strong></label>`), `missing required UI question: ${label}`);
  }
  assert.match(profileSection, /Known competitors <span>Optional<\/span>/);
  assert.match(source, /Target age range <span>Optional<\/span>/);
  assert.match(source, /Create customer competitor database/);
  assert.doesNotMatch(source, /Client or customer name/);
  assert.doesNotMatch(source, /Service or offer purchased/);
  assert.match(source, />New offer<\/button>/);
  assert.doesNotMatch(source, /className="record-review"/);
  assert.doesNotMatch(source, /className="record-delete"/);
  assert.doesNotMatch(source, /Final Gemini Deep Research prompt/);
  assert.doesNotMatch(source, /Enable ongoing monitoring/);
  assert.doesNotMatch(source, /className="prompt-sequence"/);
  assert.doesNotMatch(source, /className="three-c-grid"/);
  assert.match(source, /Open brand folder in Google Drive/);
  assert.match(source, /Tools[\s\S]*aria-label="Integrations"/);
  assert.match(source, /Provider connections live under Tools → Integrations/);
  assert.match(source, /Research stays separate by offer/);
  assert.match(source, /Filter library by offer/);
  assert.match(source, /Filter library by asset type/);
  assert.match(source, /Filter library by platform/);
  assert.match(source, /Filter library by status/);
  assert.match(source, /Filter library by date/);
  assert.match(source, /Research package:/);
  assert.match(source, /Offer:/);
  assert.match(source, /latest_run\.is_current/);
  assert.match(source, /Existing research packages stay preserved and will be marked as needing refresh/);
  assert.match(source, /new Map<string, ResearchProfile\[\]>/);
  assert.match(source, /1Password Developer Environment/);
  assert.match(source, /last only for this local process/);
  assert.doesNotMatch(source, /Local keys stay under/);
  assert.doesNotMatch(source, /googleStatus\.account_email/);
});
