import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

test("the Research UI asks all eight required customer-profile questions before research scope", async () => {
  const source = await readFile(resolve(process.cwd(), "components/intelligence-client.tsx"), "utf8");
  const profileStart = source.indexOf("<h3>Required customer profile</h3>");
  const scopeStart = source.indexOf("<h3>Research scope</h3>", profileStart);
  const requiredLabels = [
    "Client or customer name",
    "Profession or job title",
    "Company name",
    "Website or public profile URL",
    "Service or offer purchased",
    "Competitor they use",
    "Industry / niche",
    "Location or market served",
  ];

  assert.ok(profileStart >= 0, "missing the required customer-profile section");
  assert.ok(scopeStart > profileStart, "research scope must follow the customer profile");
  const profileSection = source.slice(profileStart, scopeStart);
  for (const label of requiredLabels) {
    assert.ok(profileSection.includes(`>${label} <strong>Required</strong></label>`), `missing required UI question: ${label}`);
  }
});
