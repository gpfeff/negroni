import { createHash } from "node:crypto";
import type { MediaState } from "./contracts.ts";

const SHA256_RE = /^[a-f0-9]{64}$/;
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

type DriveMediaRecord = {
  drive_file_id: string;
  path: string;
  sha256: string;
  mime_type: string;
  byte_size: number;
  app_properties: { negroni_project_id: string; sha256: string };
};

type DriveManifestRecord = {
  drive_file_id: string;
  logical_path: string;
  path: string;
  sha256: string;
  content: Record<string, unknown>;
};

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function checkedSha(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!SHA256_RE.test(normalized)) throw new Error("Drive objects require a full lowercase SHA-256.");
  return normalized;
}

function safeMachineId(value: string, label: string): string {
  const normalized = value.normalize("NFKC").trim();
  if (!/^[a-zA-Z0-9_-]{3,128}$/.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}

export function slugifyDriveName(value: string): string {
  return value.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "item";
}

export function contentAddressedMediaPath(sha256: string, mimeType: string): string {
  const hash = checkedSha(sha256);
  const extension = MIME_EXTENSIONS[mimeType.toLowerCase()];
  if (!extension) throw new Error("Drive media MIME type is not supported by the archive contract.");
  return `01-media/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.${extension}`;
}

export function deterministicAdManifestPath(input: {
  platform: string;
  advertiser_name: string;
  competitor_id: string;
  ad_record_id: string;
  content_version_id: string;
  manifest_sha256: string;
}): string {
  const platform = slugifyDriveName(input.platform);
  const advertiser = slugifyDriveName(input.advertiser_name);
  const competitor = safeMachineId(input.competitor_id, "Competitor ID");
  const ad = safeMachineId(input.ad_record_id, "Ad record ID");
  const version = safeMachineId(input.content_version_id, "Content version ID");
  const hash = checkedSha(input.manifest_sha256);
  return `02-ad-manifests/${platform}/${advertiser}--${competitor}/${ad}/${version}--${hash.slice(0, 12)}.json`;
}

export class FakeDriveProjection {
  readonly projectId: string;
  private readonly mediaByHash = new Map<string, DriveMediaRecord>();
  private readonly manifestByPath = new Map<string, DriveManifestRecord>();
  private readonly missingMedia: Array<{
    ad_record_id: string;
    source_url: string;
    state: MediaState;
    reason: string;
    object_created: false;
  }> = [];

  constructor(projectId: string, state?: {
    media?: DriveMediaRecord[];
    manifests?: DriveManifestRecord[];
    missing?: Array<{ ad_record_id: string; source_url: string; state: MediaState; reason: string; object_created: false }>;
  }) {
    if (!projectId.trim()) throw new Error("A fake Drive projection requires a project ID.");
    this.projectId = projectId;
    for (const record of state?.media ?? []) this.mediaByHash.set(record.sha256, structuredClone(record));
    for (const record of state?.manifests ?? []) this.manifestByPath.set(record.path, structuredClone(record));
    this.missingMedia.push(...structuredClone(state?.missing ?? []));
  }

  putMedia(input: { sha256: string; mime_type: string; byte_size: number }) {
    const hash = checkedSha(input.sha256);
    if (!Number.isInteger(input.byte_size) || input.byte_size < 0) throw new Error("Drive media byte size is invalid.");
    const existing = this.mediaByHash.get(hash);
    if (existing) {
      if (existing.mime_type !== input.mime_type || existing.byte_size !== input.byte_size) {
        return { ...structuredClone(existing), disposition: "suspect_metadata_conflict" as const };
      }
      return { ...structuredClone(existing), disposition: "reused" as const };
    }
    const path = contentAddressedMediaPath(hash, input.mime_type);
    const record: DriveMediaRecord = {
      drive_file_id: `fake-drive-${hash.slice(0, 16)}`,
      path,
      sha256: hash,
      mime_type: input.mime_type,
      byte_size: input.byte_size,
      app_properties: { negroni_project_id: this.projectId, sha256: hash },
    };
    this.mediaByHash.set(hash, record);
    return { ...structuredClone(record), disposition: "created" as const };
  }

  putManifest(logicalPath: string, content: Record<string, unknown>) {
    if (!logicalPath.endsWith(".json") || logicalPath.startsWith("/") || logicalPath.includes("..")) {
      throw new Error("Drive manifest paths must be relative immutable JSON paths.");
    }
    const hash = digest(canonicalJson(content));
    const existing = this.manifestByPath.get(logicalPath);
    if (existing?.sha256 === hash) return { ...structuredClone(existing), disposition: "reused" as const };
    if (!existing) {
      const record: DriveManifestRecord = {
        drive_file_id: `fake-manifest-${hash.slice(0, 16)}`,
        logical_path: logicalPath,
        path: logicalPath,
        sha256: hash,
        content: structuredClone(content),
      };
      this.manifestByPath.set(logicalPath, record);
      return { ...structuredClone(record), disposition: "created" as const };
    }
    const collisionPath = logicalPath.replace(/\.json$/, `--${hash.slice(0, 12)}.json`);
    const priorCollision = this.manifestByPath.get(collisionPath);
    if (priorCollision?.sha256 === hash) {
      return { ...structuredClone(priorCollision), disposition: "different_content_collision" as const };
    }
    const collision: DriveManifestRecord = {
      drive_file_id: `fake-manifest-${hash.slice(0, 16)}`,
      logical_path: logicalPath,
      path: collisionPath,
      sha256: hash,
      content: structuredClone(content),
    };
    this.manifestByPath.set(collisionPath, collision);
    return { ...structuredClone(collision), disposition: "different_content_collision" as const };
  }

  recordMissingMedia(input: {
    ad_record_id: string;
    source_url: string;
    state: Extract<MediaState, "not_requested" | "inaccessible" | "disallowed" | "failed">;
    reason: string;
  }) {
    if (!input.source_url.startsWith("https://") || !input.reason.trim()) {
      throw new Error("Missing media requires its HTTPS evidence URL and a reason.");
    }
    const record = { ...input, object_created: false as const };
    this.missingMedia.push(record);
    return structuredClone(record);
  }

  verifyReadback(sha256: string) {
    const hash = checkedSha(sha256);
    const record = this.mediaByHash.get(hash);
    return {
      sha256: hash,
      drive_file_id: record?.drive_file_id ?? null,
      readback_sha256: record?.sha256 ?? null,
      verified: record?.sha256 === hash,
      restricted: true,
      external_mutation: false,
    } as const;
  }

  objects(): DriveMediaRecord[] {
    return [...this.mediaByHash.values()].map((record) => structuredClone(record));
  }

  manifests(): DriveManifestRecord[] {
    return [...this.manifestByPath.values()].map((record) => structuredClone(record));
  }

  missing(): typeof this.missingMedia {
    return structuredClone(this.missingMedia);
  }

  exportState() {
    return { media: this.objects(), manifests: this.manifests(), missing: this.missing() };
  }
}
