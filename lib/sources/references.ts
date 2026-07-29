import type {
  SourceReference,
  SourceRole,
  TemplateTreatment,
} from "@/lib/contracts/types";
import { parsePublicHttpUrl } from "@/lib/sources/url";

function sourceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `source-${Date.now()}`;
}

export function createLocalSourceReference(
  file: File,
  detectedType: string,
  role: SourceRole,
  notes: string,
  templateTreatment: TemplateTreatment = "unassigned",
): SourceReference {
  return {
    id: sourceId(),
    kind: "local_file",
    name: file.name,
    url: null,
    declared_type: file.type || "Not declared",
    detected_type: detectedType,
    role,
    template_treatment: templateTreatment,
    status: "registered",
    notes,
    byte_size: file.size,
    last_modified: new Date(file.lastModified).toISOString(),
  };
}

export function createUrlSourceReference(
  url: string,
  role: SourceRole,
  notes: string,
  templateTreatment: TemplateTreatment = "unassigned",
): SourceReference {
  const parsed = parsePublicHttpUrl(url);
  return {
    id: sourceId(),
    kind: "url",
    name: parsed.hostname,
    url: parsed.toString(),
    declared_type: "URL reference",
    detected_type: "Remote resource — contents not fetched",
    role,
    template_treatment: templateTreatment,
    status: "registered",
    notes,
    byte_size: null,
    last_modified: null,
  };
}
