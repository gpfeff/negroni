import { ensureResearchSchema, type Database } from "@/lib/database";
import type {
  IntelligenceIntake,
  ResearchProfile,
  ResearchRunSummary,
  RunResult,
} from "@/lib/intelligence/contracts";

type ResearchProfileRow = Omit<ResearchProfile, "latest_run"> & {
  latest_run_id: string;
  latest_run_status: string;
  latest_run_completed_at: string;
  drive_folder_name: string;
  drive_folder_url: string;
  google_doc_url: string;
  google_sheet_url: string;
  markdown_filename: string;
  latest_run_basis_json: string;
};

type ResearchBasis = Pick<
  IntelligenceIntake,
  | "profession"
  | "job_title"
  | "company_name"
  | "website_or_public_profile_url"
  | "competitor_used"
  | "offer_or_lead_type"
  | "industry"
  | "country_region"
  | "target_age_range"
>;

const PROFILE_COLUMNS = `
  id, brand_id, profession, job_title, company_name, website_or_public_profile_url,
  competitor_used, offer_or_lead_type, industry, country_region,
  target_age_range, created_at, updated_at, latest_run_id, latest_run_status,
  latest_run_completed_at, drive_folder_name, drive_folder_url, google_doc_url,
  google_sheet_url, markdown_filename, latest_run_basis_json
`;

const RESEARCH_BASIS_KEYS = [
  "profession",
  "job_title",
  "company_name",
  "website_or_public_profile_url",
  "competitor_used",
  "offer_or_lead_type",
  "industry",
  "country_region",
  "target_age_range",
] as const;

function researchBasis(input: ResearchBasis): ResearchBasis {
  return Object.fromEntries(RESEARCH_BASIS_KEYS.map((key) => [key, input[key].trim()])) as ResearchBasis;
}

function savedBasis(value: string): ResearchBasis | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (Object.keys(record).sort().join(",") !== [...RESEARCH_BASIS_KEYS].sort().join(",")
      || RESEARCH_BASIS_KEYS.some((key) => typeof record[key] !== "string")) return null;
    return researchBasis(record as ResearchBasis);
  } catch {
    return null;
  }
}

function googleUrl(value: string, hostname: string, pathPrefix: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === hostname && url.pathname.startsWith(pathPrefix);
  } catch {
    return false;
  }
}

function summaryFromRow(row: ResearchProfileRow): ResearchRunSummary | null {
  if (!row.latest_run_id) return null;
  if (!/^run_[a-f0-9]{24}$/.test(row.latest_run_id)
    || !["complete", "partial"].includes(row.latest_run_status)
    || !row.latest_run_completed_at
    || !row.drive_folder_name
    || !row.drive_folder_url
    || !row.google_doc_url
    || !row.markdown_filename
    || !Number.isFinite(Date.parse(row.latest_run_completed_at))
    || !googleUrl(row.drive_folder_url, "drive.google.com", "/drive/folders/")
    || !googleUrl(row.google_doc_url, "docs.google.com", "/document/d/")
    || (row.google_sheet_url !== "" && !googleUrl(row.google_sheet_url, "docs.google.com", "/spreadsheets/d/"))
    || !/^[a-z0-9][a-z0-9._-]{2,199}\.md$/.test(row.markdown_filename)) {
    return null;
  }
  const basis = savedBasis(row.latest_run_basis_json);
  return {
    run_id: row.latest_run_id,
    status: row.latest_run_status as ResearchRunSummary["status"],
    completed_at: row.latest_run_completed_at,
    folder_name: row.drive_folder_name,
    folder_url: row.drive_folder_url,
    google_doc_url: row.google_doc_url,
    google_sheet_url: row.google_sheet_url || null,
    markdown_filename: row.markdown_filename,
    is_current: basis !== null
      && JSON.stringify(basis) === JSON.stringify(researchBasis(row)),
  };
}

function profileFromRow(row: ResearchProfileRow): ResearchProfile {
  return {
    id: row.id,
    brand_id: row.brand_id,
    profession: row.profession,
    job_title: row.job_title,
    company_name: row.company_name,
    website_or_public_profile_url: row.website_or_public_profile_url,
    competitor_used: row.competitor_used,
    offer_or_lead_type: row.offer_or_lead_type,
    industry: row.industry,
    country_region: row.country_region,
    target_age_range: row.target_age_range,
    created_at: row.created_at,
    updated_at: row.updated_at,
    latest_run: summaryFromRow(row),
  };
}

export async function listResearchProfiles(database: Database, owner: string): Promise<ResearchProfile[]> {
  await ensureResearchSchema(database);
  const rows = await database.prepare(`
    SELECT ${PROFILE_COLUMNS}
    FROM research_profiles
    WHERE owner_email = ?
    ORDER BY updated_at DESC
    LIMIT 100
  `).bind(owner).all<ResearchProfileRow>();
  return (rows.results ?? []).map(profileFromRow);
}

function savedOfferMatchesIntake(profile: ResearchProfile, intake: IntelligenceIntake): boolean {
  return profile.profession === intake.profession.trim()
    && profile.job_title === intake.job_title.trim()
    && profile.company_name === intake.company_name.trim()
    && profile.website_or_public_profile_url === intake.website_or_public_profile_url.trim()
    && profile.competitor_used === intake.competitor_used.trim()
    && profile.offer_or_lead_type === intake.offer_or_lead_type.trim()
    && profile.industry === intake.industry.trim()
    && profile.country_region === intake.country_region.trim()
    && profile.target_age_range === intake.target_age_range.trim();
}

function runSummary(result: RunResult): ResearchRunSummary {
  return {
    run_id: result.run_id,
    status: result.status,
    completed_at: result.completed_at,
    folder_name: result.brand_library.folder_name,
    folder_url: result.brand_library.folder_url,
    google_doc_url: result.outputs.google_doc.url,
    google_sheet_url: result.outputs.google_sheet.status === "published" ? result.outputs.google_sheet.url : null,
    markdown_filename: result.outputs.markdown.filename,
    is_current: true,
  };
}

export async function assertSavedResearchOffer(
  database: Database,
  owner: string,
  profileId: string,
  intake: IntelligenceIntake,
): Promise<ResearchProfile> {
  const profile = (await listResearchProfiles(database, owner)).find(({ id }) => id === profileId);
  if (!profile || !savedOfferMatchesIntake(profile, intake)) {
    throw new Error("The research request does not match the saved offer.");
  }
  return profile;
}

export async function persistResearchRunSummary(
  database: Database,
  owner: string,
  profileId: string,
  intake: IntelligenceIntake,
  result: RunResult,
): Promise<void> {
  await assertSavedResearchOffer(database, owner, profileId, intake);
  const summary = runSummary(result);
  const update = await database.prepare(`
    UPDATE research_profiles
    SET latest_run_id = ?, latest_run_status = ?, latest_run_completed_at = ?,
      drive_folder_name = ?, drive_folder_url = ?, google_doc_url = ?,
      google_sheet_url = ?, markdown_filename = ?, latest_run_basis_json = ?, updated_at = ?
    WHERE id = ? AND owner_email = ?
  `).bind(
    summary.run_id,
    summary.status,
    summary.completed_at,
    summary.folder_name,
    summary.folder_url,
    summary.google_doc_url,
    summary.google_sheet_url ?? "",
    summary.markdown_filename,
    JSON.stringify(researchBasis(intake)),
    new Date().toISOString(),
    profileId,
    owner,
  ).run();
  if (update.meta?.changes !== undefined && update.meta.changes !== 1) {
    throw new Error("The verified research receipt could not be attached to the offer.");
  }
  const stored = (await listResearchProfiles(database, owner)).find(({ id }) => id === profileId)?.latest_run;
  if (JSON.stringify(stored) !== JSON.stringify(summary)) {
    throw new Error("The verified research receipt failed readback.");
  }
}
