import assert from "node:assert/strict";
import { File } from "node:buffer";
import test from "node:test";
import JSZip from "jszip";
import {
  detectBytes,
  detectLocalFile,
  detectTextType,
} from "@/lib/sources/detect";
import {
  createLocalSourceReference,
  createUrlSourceReference,
} from "@/lib/sources/references";
import { parsePublicHttpUrl } from "@/lib/sources/url";

test("text detection distinguishes JSON, HTML, Markdown, CSV, and plain text", () => {
  assert.equal(detectTextType(""), "Empty text file");
  assert.equal(detectTextType("<!doctype html><html></html>"), "HTML document");
  assert.equal(detectTextType('{"ok":true}'), "JSON data");
  assert.equal(detectTextType("# Heading\nBody"), "Markdown text");
  assert.equal(detectTextType("a,b\n1,2"), "CSV data");
  assert.equal(detectTextType("ordinary prose"), "Plain text");
});

test("magic bytes override a misleading filename and MIME declaration", async () => {
  const file = new File(["%PDF-1.7\n"], "example.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    lastModified: 1_700_000_000_000,
  });
  assert.equal(await detectLocalFile(file as unknown as globalThis.File), "PDF document");
  const reference = createLocalSourceReference(
    file as unknown as globalThis.File,
    "PDF document",
    "past_example",
    "Structure only",
    "past_example",
  );
  assert.equal(reference.name, "example.docx");
  assert.equal(reference.declared_type.includes("wordprocessingml"), true);
  assert.equal(reference.detected_type, "PDF document");
  assert.equal(reference.role, "past_example");
  assert.equal(reference.status, "registered");
});

test("OOXML contents determine Word, PowerPoint, and Excel types", async () => {
  for (const [entry, expected] of [
    ["word/document.xml", "OOXML Word document"],
    ["ppt/presentation.xml", "OOXML PowerPoint presentation"],
    ["xl/workbook.xml", "OOXML Excel workbook"],
  ] as const) {
    const zip = new JSZip();
    zip.file(entry, "<root />");
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const file = new File([bytes], "opaque.zip");
    assert.equal(
      await detectLocalFile(file as unknown as globalThis.File),
      expected,
    );
  }
});

test("binary signatures identify common document and image containers", () => {
  assert.equal(detectBytes(Uint8Array.from([0x25, 0x50, 0x44, 0x46])), "PDF document");
  assert.equal(detectBytes(Uint8Array.from([0x89, 0x50, 0x4e, 0x47])), "PNG image");
  assert.equal(detectBytes(Uint8Array.from([0xff, 0xd8, 0xff])), "JPEG image");
  assert.equal(
    detectBytes(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0])),
    "Legacy Office binary container",
  );
});

test("URL registration is public HTTP(S), credential-free, and metadata-only", () => {
  assert.equal(parsePublicHttpUrl("https://example.com/a").hostname, "example.com");
  for (const url of [
    "ftp://example.com/file",
    "http://127.0.0.1/admin",
    "http://169.254.169.254/latest/meta-data",
    "http://192.168.1.2/file",
    "http://service.local/file",
    "https://user:pass@example.com/file",
    "https://example.com/file?sig=secret",
  ]) {
    assert.throws(() => parsePublicHttpUrl(url), Error, url);
  }

  const source = createUrlSourceReference(
    "https://example.com/source",
    "template",
    "Use the native structure",
    "exact_template",
  );
  assert.equal(source.detected_type, "Remote resource — contents not fetched");
  assert.equal(source.template_treatment, "exact_template");
  assert.equal(source.status, "registered");
});
