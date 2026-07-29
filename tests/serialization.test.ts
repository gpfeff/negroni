import assert from "node:assert/strict";
import test from "node:test";
import {
  importProjectJson,
  serializeCanonicalIntake,
  serializeIntakePackage,
} from "@/lib/contracts/serialization";
import { createUrlSourceReference } from "@/lib/sources/references";
import { readyProject } from "./helpers";

test("canonical and package exports are stable, portable, and newline-terminated", () => {
  const project = readyProject();
  project.field_states["market.known_seasonality"] = "research_this";
  project.raw_answers["market.known_seasonality"] = "Need to verify seasonality";
  project.intake.sources.urls.push(
    createUrlSourceReference(
      "https://example.com/public-source",
      "factual_source",
      "Public reference",
      "not_applicable",
    ),
  );

  const before = structuredClone(project);
  const canonical = serializeCanonicalIntake(project);
  const packaged = serializeIntakePackage(project);
  assert.ok(canonical.endsWith("\n"));
  assert.ok(packaged.endsWith("\n"));
  assert.deepEqual(project, before);

  const imported = importProjectJson(
    packaged,
    "2026-01-16T00:00:00.000Z",
  );
  assert.notEqual(imported.id, project.id);
  assert.equal(imported.run_manifest, null);
  assert.equal(
    imported.field_states["market.known_seasonality"],
    "research_this",
  );
  assert.equal(
    imported.raw_answers["market.known_seasonality"],
    "Need to verify seasonality",
  );
  assert.deepEqual(imported.intake.sources, project.intake.sources);
});

test("intake-only import derives ready or draft state", () => {
  const ready = readyProject();
  const importedReady = importProjectJson(serializeCanonicalIntake(ready));
  assert.equal(importedReady.state, "ready");

  ready.intake.project.name = "";
  const importedDraft = importProjectJson(serializeCanonicalIntake(ready));
  assert.equal(importedDraft.state, "draft");
});

test("package import rejects unsupported versions, states, and source drift", () => {
  const parsed = JSON.parse(serializeIntakePackage(readyProject()));
  parsed.contract_version = "2.0";
  assert.throws(() => importProjectJson(JSON.stringify(parsed)), /version/);

  parsed.contract_version = "1.0";
  parsed.field_states["project.name"] = "maybe";
  assert.throws(() => importProjectJson(JSON.stringify(parsed)), /answer state/);

  parsed.field_states["project.name"] = "known";
  parsed.source_manifest.push({ id: "drift" });
  assert.throws(() => importProjectJson(JSON.stringify(parsed)), /does not match/);
});

test("malformed nested types and enums are rejected deliberately", () => {
  const canonical = JSON.parse(serializeCanonicalIntake(readyProject()));
  canonical.market.languages = "English";
  assert.throws(() => importProjectJson(JSON.stringify(canonical)), /array/);

  canonical.market.languages = ["English"];
  canonical.business_model.conversion_unit = "click";
  assert.throws(() => importProjectJson(JSON.stringify(canonical)), /not supported/);

  canonical.business_model.conversion_unit = "form_lead";
  canonical.project = null;
  assert.throws(() => importProjectJson(JSON.stringify(canonical)), /object/);
});

test("secret-bearing keys, values, credentials, and signed URLs are rejected", () => {
  const project = readyProject();
  project.intake.project.notes = "api_key=abc123456789012345";
  assert.throws(() => serializeCanonicalIntake(project), /credential-like/);

  const canonical = JSON.parse(
    serializeCanonicalIntake(readyProject()),
  ) as Record<string, unknown>;
  (canonical.project as Record<string, unknown>).clientSecret = "hidden";
  assert.throws(() => importProjectJson(JSON.stringify(canonical)), /credential-like/);

  (canonical.project as Record<string, unknown>).clientSecret = undefined;
  (canonical.project as Record<string, unknown>).notes =
    "https://user:pass@example.com/source";
  assert.throws(() => importProjectJson(JSON.stringify(canonical)), /credential-like/);

  (canonical.project as Record<string, unknown>).notes =
    "https://example.com/object?X-Amz-Signature=abcdef";
  assert.throws(() => importProjectJson(JSON.stringify(canonical)), /credential-like/);
});
