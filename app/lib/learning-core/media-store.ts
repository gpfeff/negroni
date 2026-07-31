import { createHash, randomBytes } from "node:crypto";
import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { assertText } from "./contracts.ts";

export type StoredMedia = {
  sha256: string;
  byte_size: number;
  mime_type: string;
  relative_key: string;
  deduplicated: boolean;
};

export class ContentAddressedMediaStore {
  readonly #root: string;

  constructor(root: string) {
    this.#root = resolve(root);
  }

  async put(input: Uint8Array, mimeType: string): Promise<StoredMedia> {
    if (!(input instanceof Uint8Array) || input.byteLength === 0 || input.byteLength > 25 * 1024 * 1024) {
      throw new Error("media must contain 1 byte through 25 MiB.");
    }
    const normalizedMime = assertText(mimeType, "mime_type", 120).toLowerCase();
    if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(normalizedMime)) {
      throw new Error("mime_type is invalid.");
    }
    const sha256 = createHash("sha256").update(input).digest("hex");
    const relativeKey = `sha256/${sha256.slice(0, 2)}/${sha256}`;
    const destination = resolve(this.#root, relativeKey);
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    const temporary = `${destination}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
    await writeFile(temporary, input, { flag: "wx", mode: 0o600 });
    let deduplicated = false;
    try {
      await link(temporary, destination);
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error;
      const existing = await readFile(destination);
      const existingHash = createHash("sha256").update(existing).digest("hex");
      if (existingHash !== sha256 || existing.byteLength !== input.byteLength) {
        throw new Error("content-addressed media collision detected.");
      }
      deduplicated = true;
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
    return {
      sha256,
      byte_size: input.byteLength,
      mime_type: normalizedMime,
      relative_key: relativeKey,
      deduplicated,
    };
  }
}
