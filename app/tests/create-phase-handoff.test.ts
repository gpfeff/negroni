import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

test("Create requires an approved offer-scoped Research fingerprint", async () => {
  const gate = await readFile(resolve(process.cwd(), "components/create-phase-page.tsx"), "utf8");
  const editor = await readFile(resolve(process.cwd(), "components/quiz-funnel-editor.tsx"), "utf8");

  assert.match(gate, /api\/review\?profile_id=/);
  assert.match(gate, /approved_revision_id/);
  assert.match(gate, /approved_seed_sha256/);
  assert.match(gate, /draftScope: `\$\{selectedProfile\.id\}\.\$\{approvedId\}\.\$\{fingerprint\}`/);
  assert.match(gate, /Approve Research before Create/);
  assert.match(editor, /negroni\.quiz-funnel\.lead-capture\.v2/);
  assert.match(editor, /readLocalDraft\(draftKey\)/);
  assert.match(editor, /localStorage\.setItem\(draftKey/);
  assert.doesNotMatch(editor, /const DRAFT_KEY = "negroni\.quiz-funnel\.lead-capture\.v1"/);
});

test("Research cards and mobile navigation retain real destinations", async () => {
  const client = await readFile(resolve(process.cwd(), "components/intelligence-client.tsx"), "utf8");
  const styles = await readFile(resolve(process.cwd(), "app/globals.css"), "utf8");

  assert.match(client, /client: "intake"/);
  assert.match(client, /customer: "offer-type"/);
  assert.match(client, /competitors: "competitor-used"/);
  assert.match(client, /"competitor-ads": "competitor-ads"/);
  assert.match(client, /review: "research-review"/);
  assert.match(client, /<ResearchReview profile=\{selectedProfile\}/);
  assert.match(client, /<CreatePhasePage key=/);
  assert.match(client, /aria-current=\{phase\.id === activeView \? "page"/);
  assert.match(styles, /\.side-nav button \{ flex: 0 0 auto; min-height: 44px;/);
  assert.doesNotMatch(styles, /\.side-nav button\.nav-requires-handoff\s*\{\s*display:\s*none/);
});
