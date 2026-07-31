import { createHash } from "node:crypto";
import type { OutboxState } from "./contracts.ts";

export const WORKBOOK_TABS = [
  "Competitors",
  "Ads",
  "Observations",
  "Assets",
  "Creative Families",
  "Family Members",
  "Enrichments",
  "Landing Pages",
  "Runs",
  "Research Evidence",
  "Ratings",
  "Watchlist",
  "Taxonomy",
  "Settings",
  "New Today",
  "Active Longest",
  "Public Winner Signals",
  "Hooks and Offers",
  "Run Health",
] as const;
export type WorkbookTab = (typeof WORKBOOK_TABS)[number];

export const HUMAN_OWNED_FIELDS = [
  "rating",
  "notes",
  "family_override",
  "label_corrections",
  "human_review_status",
  "reviewer",
  "reviewed_at",
] as const;

export const MACHINE_MANAGED_TABS = WORKBOOK_TABS.filter(
  (tab) => !["Ratings", "Watchlist"].includes(tab),
);

export type ProjectionOutboxItem = {
  logical_key: string;
  state: OutboxState;
  attempts: number;
  last_error: string | null;
  drive_file_id?: string | null;
  sheet_key?: string | null;
};

type SheetValue = string | number | boolean | null;
type SheetRow = Record<string, SheetValue>;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalRows(rows: SheetRow[], keyField: string): string {
  const ordered = rows
    .map((row) => Object.fromEntries(Object.entries(row).sort(([left], [right]) => left.localeCompare(right))))
    .sort((left, right) => String(left[keyField] ?? "").localeCompare(String(right[keyField] ?? "")));
  return JSON.stringify(ordered);
}

function cloneRows(rows: SheetRow[]): SheetRow[] {
  return rows.map((row) => ({ ...row }));
}

export function formulaSafeValue<T>(value: T): T | string {
  return typeof value === "string" && /^[=+\-@]/.test(value) ? `'${value}` : value;
}

export function transitionOutbox<T extends ProjectionOutboxItem>(
  item: T,
  next: OutboxState,
): T {
  const allowed: Record<OutboxState, OutboxState | null> = {
    pending: "drive_uploaded",
    drive_uploaded: "sheet_linked",
    sheet_linked: "complete",
    complete: null,
  };
  if (allowed[item.state] !== next) {
    throw new Error(`Invalid outbox transition from ${item.state} to ${next}.`);
  }
  return {
    ...item,
    state: next,
    attempts: item.attempts + 1,
    last_error: null,
  };
}

export class FakeSheetsProjection {
  readonly projectId: string;
  private readonly tabs = new Map<WorkbookTab, SheetRow[]>();
  private readonly keyFields = new Map<WorkbookTab, string>();

  constructor(projectId: string, state?: { tabs?: Partial<Record<WorkbookTab, SheetRow[]>>; key_fields?: Partial<Record<WorkbookTab, string>> }) {
    if (!projectId.trim()) throw new Error("A fake Sheet projection requires a project ID.");
    this.projectId = projectId;
    if (state?.tabs) {
      for (const [tab, rows] of Object.entries(state.tabs)) {
        if (WORKBOOK_TABS.includes(tab as WorkbookTab) && Array.isArray(rows)) {
          this.tabs.set(tab as WorkbookTab, cloneRows(rows));
        }
      }
    }
    if (state?.key_fields) {
      for (const [tab, key] of Object.entries(state.key_fields)) {
        if (WORKBOOK_TABS.includes(tab as WorkbookTab) && typeof key === "string") {
          this.keyFields.set(tab as WorkbookTab, key);
        }
      }
    }
  }

  ensureContract() {
    for (const tab of WORKBOOK_TABS) if (!this.tabs.has(tab)) this.tabs.set(tab, []);
    return {
      contract: "negroni-hybrid-workbook",
      contract_version: "1.0",
      project_id: this.projectId,
      tabs: [...WORKBOOK_TABS],
      protections: [...MACHINE_MANAGED_TABS],
      human_owned_tabs: ["Ratings", "Watchlist"],
      human_owned_fields: [...HUMAN_OWNED_FIELDS],
      restricted: true,
      value_input_mode: "RAW",
    } as const;
  }

  upsertRows(tab: WorkbookTab, keyField: string, incomingRows: SheetRow[]): void {
    if (!this.tabs.has(tab)) throw new Error(`Workbook tab ${tab} has not been provisioned.`);
    if (!keyField.trim()) throw new Error("Sheet upserts require an immutable key field.");
    const rows = this.tabs.get(tab)!;
    const positions = new Map(rows.map((row, index) => [String(row[keyField] ?? ""), index]));
    for (const incoming of incomingRows) {
      const sanitized = Object.fromEntries(
        Object.entries(incoming).map(([key, value]) => [key, formulaSafeValue(value) as SheetValue]),
      );
      const key = String(sanitized[keyField] ?? "");
      if (!key) throw new Error(`Sheet row lacks immutable key ${keyField}.`);
      const position = positions.get(key);
      if (position === undefined) {
        positions.set(key, rows.length);
        rows.push(sanitized);
        continue;
      }
      const prior = rows[position];
      const preserved = Object.fromEntries(
        HUMAN_OWNED_FIELDS.filter((field) => field in prior).map((field) => [field, prior[field]]),
      );
      rows[position] = { ...prior, ...sanitized, ...preserved };
    }
    this.keyFields.set(tab, keyField);
  }

  readRows(tab: WorkbookTab): SheetRow[] {
    if (!this.tabs.has(tab)) throw new Error(`Workbook tab ${tab} has not been provisioned.`);
    return cloneRows(this.tabs.get(tab)!);
  }

  verifyReadback(tab: WorkbookTab, keyField = this.keyFields.get(tab) ?? "id") {
    const desired = canonicalRows(this.tabs.get(tab) ?? [], keyField);
    const readback = canonicalRows(this.readRows(tab), keyField);
    return {
      contract: "negroni-sheet-sync-receipt",
      contract_version: "1.0",
      project_id: this.projectId,
      tab,
      key_field: keyField,
      row_count: this.readRows(tab).length,
      desired_sha256: sha256(desired),
      readback_sha256: sha256(readback),
      readback_verified: desired === readback,
      protections_verified: MACHINE_MANAGED_TABS.includes(tab) || ["Ratings", "Watchlist"].includes(tab),
      external_mutation: false,
    } as const;
  }

  exportState() {
    return {
      tabs: Object.fromEntries([...this.tabs.entries()].map(([tab, rows]) => [tab, cloneRows(rows)])),
      key_fields: Object.fromEntries(this.keyFields.entries()),
    };
  }
}
