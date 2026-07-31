import assert from "node:assert/strict";
import test from "node:test";
import {
  FakeSheetsProjection,
  MACHINE_MANAGED_TABS,
  WORKBOOK_TABS,
  formulaSafeValue,
  transitionOutbox,
  type ProjectionOutboxItem,
} from "@/lib/competitor-research/sheet-contract";
import {
  FakeDriveProjection,
  contentAddressedMediaPath,
  deterministicAdManifestPath,
} from "@/lib/competitor-research/drive-contract";

test("the hybrid workbook exposes protected machine tabs and editable human tabs", () => {
  const sheets = new FakeSheetsProjection("fixture-project");
  const contract = sheets.ensureContract();

  const expectedTabs: Array<(typeof WORKBOOK_TABS)[number]> = [
    "Competitors", "Ads", "Observations", "Assets", "Creative Families", "Ratings", "Watchlist", "Public Winner Signals", "Run Health",
  ];
  for (const tab of expectedTabs) {
    assert.ok(WORKBOOK_TABS.includes(tab), tab);
  }
  assert.equal(contract.tabs.length, WORKBOOK_TABS.length);
  assert.equal(contract.protections.every((tab) => MACHINE_MANAGED_TABS.includes(tab)), true);
  assert.equal(contract.protections.includes("Ratings"), false);
  assert.equal(contract.restricted, true);
});

test("formula-like evidence is written as data and human-owned fields survive machine upserts", () => {
  assert.equal(formulaSafeValue("=IMPORTXML(\"https://example.invalid\")"), "'=IMPORTXML(\"https://example.invalid\")");
  assert.equal(formulaSafeValue("+1"), "'+1");
  assert.equal(formulaSafeValue("-1"), "'-1");
  assert.equal(formulaSafeValue("@handle"), "'@handle");

  const sheets = new FakeSheetsProjection("fixture-project");
  sheets.ensureContract();
  sheets.upsertRows("Ads", "ad_record_id", [{
    ad_record_id: "ad_fixture_001",
    ad_copy: "=untrusted formula-like copy",
    lifecycle_status: "active",
    rating: 4,
    notes: "Reviewer note",
  }]);
  sheets.upsertRows("Ads", "ad_record_id", [{
    ad_record_id: "ad_fixture_001",
    ad_copy: "+updated untrusted copy",
    lifecycle_status: "reactivated",
    rating: null,
    notes: "machine must not replace this",
  }]);

  assert.deepEqual(sheets.readRows("Ads"), [{
    ad_record_id: "ad_fixture_001",
    ad_copy: "'+updated untrusted copy",
    lifecycle_status: "reactivated",
    rating: 4,
    notes: "Reviewer note",
  }]);
  const receipt = sheets.verifyReadback("Ads", "ad_record_id");
  assert.equal(receipt.readback_verified, true);
  assert.match(receipt.desired_sha256, /^[a-f0-9]{64}$/);
  assert.equal(receipt.desired_sha256, receipt.readback_sha256);
});

test("repeating an identical Sheet projection is row- and hash-idempotent", () => {
  const sheets = new FakeSheetsProjection("fixture-project");
  sheets.ensureContract();
  const row = { ad_record_id: "ad_fixture_001", ad_copy: "Synthetic evidence" };
  sheets.upsertRows("Ads", "ad_record_id", [row]);
  const first = sheets.verifyReadback("Ads", "ad_record_id");
  sheets.upsertRows("Ads", "ad_record_id", [row]);
  const second = sheets.verifyReadback("Ads", "ad_record_id");
  assert.equal(sheets.readRows("Ads").length, 1);
  assert.equal(first.readback_sha256, second.readback_sha256);
});

test("the fake outbox permits only durable forward transitions", () => {
  let item: ProjectionOutboxItem = { logical_key: "asset:abc", state: "pending", attempts: 0, last_error: null };
  item = transitionOutbox(item, "drive_uploaded");
  item = transitionOutbox(item, "sheet_linked");
  item = transitionOutbox(item, "complete");
  assert.equal(item.state, "complete");
  assert.equal(item.attempts, 3);
  assert.throws(
    () => transitionOutbox({ logical_key: "asset:def", state: "pending", attempts: 0, last_error: null }, "sheet_linked"),
    /invalid outbox transition/i,
  );
});

test("Drive paths are content-addressed and same-hash uploads deduplicate", () => {
  const sha = "a".repeat(64);
  assert.equal(contentAddressedMediaPath(sha, "image/png"), `01-media/sha256/aa/aa/${sha}.png`);

  const drive = new FakeDriveProjection("fixture-project");
  const first = drive.putMedia({ sha256: sha, mime_type: "image/png", byte_size: 128 });
  const second = drive.putMedia({ sha256: sha, mime_type: "image/png", byte_size: 128 });
  assert.equal(first.drive_file_id, second.drive_file_id);
  assert.equal(second.disposition, "reused");
  assert.equal(drive.objects().length, 1);
  assert.equal(drive.verifyReadback(sha).verified, true);
  assert.equal(first.app_properties.sha256, sha);
});

test("different-content logical collisions and missing media are preserved explicitly", () => {
  const drive = new FakeDriveProjection("fixture-project");
  const logicalPath = "02-ad-manifests/meta/example-signal--cmp_fixture/ad_fixture/creative.json";
  const first = drive.putManifest(logicalPath, { revision: 1, evidence: "synthetic" });
  const collision = drive.putManifest(logicalPath, { revision: 2, evidence: "synthetic" });
  assert.equal(first.disposition, "created");
  assert.equal(collision.disposition, "different_content_collision");
  assert.notEqual(first.path, collision.path);
  assert.equal(drive.manifests().length, 2);

  const missing = drive.recordMissingMedia({
    ad_record_id: "ad_fixture_001",
    source_url: "https://example.invalid/media/unavailable.png",
    state: "inaccessible",
    reason: "fixture_source_unavailable",
  });
  assert.equal(missing.object_created, false);
  assert.equal(drive.objects().length, 0);
});

test("same hash with conflicting metadata is quarantined instead of overwritten", () => {
  const drive = new FakeDriveProjection("fixture-project");
  const sha = "b".repeat(64);
  drive.putMedia({ sha256: sha, mime_type: "image/png", byte_size: 128 });
  const suspect = drive.putMedia({ sha256: sha, mime_type: "image/jpeg", byte_size: 128 });
  assert.equal(suspect.disposition, "suspect_metadata_conflict");
  assert.equal(drive.objects()[0].mime_type, "image/png");
});

test("ad manifest names are deterministic and exclude untrusted copy", () => {
  const path = deterministicAdManifestPath({
    platform: "meta",
    advertiser_name: "Example Signal Studio",
    competitor_id: "cmp_fixture_001",
    ad_record_id: "ad_fixture_001",
    content_version_id: "acv_fixture_002",
    manifest_sha256: "c".repeat(64),
  });
  assert.equal(path, "02-ad-manifests/meta/example-signal-studio--cmp_fixture_001/ad_fixture_001/acv_fixture_002--cccccccccccc.json");
  assert.doesNotMatch(path, /offer|headline|copy/i);
});
