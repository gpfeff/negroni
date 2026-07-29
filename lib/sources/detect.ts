import JSZip from "jszip";

const decoder = new TextDecoder("utf-8", { fatal: false });

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

function looksLikeCsv(text: string): boolean {
  const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 5);
  if (lines.length < 2) return false;
  const counts = lines.map((line) => (line.match(/,/g) ?? []).length);
  return counts[0] > 0 && counts.every((count) => count === counts[0]);
}

export function detectTextType(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "Empty text file";
  if (/^<!doctype html|^<html[\s>]/i.test(trimmed)) return "HTML document";
  try {
    JSON.parse(trimmed);
    return "JSON data";
  } catch {
    // Keep inspecting the actual text.
  }
  if (
    /(^|\n)#{1,6}\s+\S/.test(trimmed) ||
    /\[[^\]]+\]\([^)]+\)/.test(trimmed) ||
    /(^|\n)```/.test(trimmed)
  ) {
    return "Markdown text";
  }
  if (looksLikeCsv(trimmed)) return "CSV data";
  return "Plain text";
}

export function detectBytes(bytes: Uint8Array, text = ""): string {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return "PDF document";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "PNG image";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "JPEG image";
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    decoder.decode(bytes.slice(8, 12)) === "WEBP"
  ) {
    return "WebP image";
  }
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    return "ZIP or OOXML container";
  }
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) {
    return "Legacy Office binary container";
  }
  return detectTextType(text || decoder.decode(bytes));
}

export async function detectLocalFile(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.slice(0, 131_072).arrayBuffer());
  const baseType = detectBytes(bytes);
  if (baseType !== "ZIP or OOXML container") return baseType;

  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const names = Object.keys(zip.files);
    if (names.includes("word/document.xml")) return "OOXML Word document";
    if (names.includes("ppt/presentation.xml")) {
      return "OOXML PowerPoint presentation";
    }
    if (names.includes("xl/workbook.xml")) return "OOXML Excel workbook";
    if (names.includes("META-INF/container.xml")) return "EPUB document";
    return "ZIP archive";
  } catch {
    return "ZIP-like container (unreadable)";
  }
}
