import type { IntelligenceIntake, ProfilesResponse, ResearchProfile } from "@/lib/intelligence/contracts";
import { authenticatedOwner } from "@/lib/authenticated-user";
import { ensureResearchSchema, getDatabase } from "@/lib/database";
import { validateIntake } from "@/lib/intelligence/validation";
import { boundedJson, mutationAllowed } from "@/lib/request-security";
import { listResearchProfiles } from "@/lib/research-profiles";

const STORAGE_BLOCKER = "Saved brands and offers are unavailable until the site database is configured.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalRecordId(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.trim())) {
    throw new Error("Invalid record identity.");
  }
  return value.trim();
}

export async function GET(request: Request): Promise<Response> {
  const owner = authenticatedOwner(request);
  if (!owner) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const database = await getDatabase();
  if (!database) {
    const response: ProfilesResponse = { available: false, records: [], blocker: STORAGE_BLOCKER };
    return Response.json(response, { headers: { "cache-control": "no-store" } });
  }
  const response: ProfilesResponse = { available: true, records: await listResearchProfiles(database, owner), blocker: null };
  return Response.json(response, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  if (!mutationAllowed(request)) return Response.json({ error: "A same-origin request is required." }, { status: 403 });
  const owner = authenticatedOwner(request);
  if (!owner) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const database = await getDatabase();
  if (!database) return Response.json({ error: STORAGE_BLOCKER }, { status: 503 });
  let body: { id?: string; brand_id?: string; intake: IntelligenceIntake };
  try {
    const value = await boundedJson(request, 24_000);
    if (!isRecord(value)
      || Object.keys(value).some((key) => !["id", "brand_id", "intake"].includes(key))
      || !isRecord(value.intake)) {
      throw new Error("Invalid brand or offer request.");
    }
    body = {
      id: optionalRecordId(value.id) || undefined,
      brand_id: optionalRecordId(value.brand_id) || undefined,
      intake: value.intake as IntelligenceIntake,
    };
  } catch {
    return Response.json({ error: "The brand or offer request is invalid." }, { status: 400 });
  }
  const errors = validateIntake(body.intake);
  if (errors.length) return Response.json({ error: errors.join(" ") }, { status: 400 });

  await ensureResearchSchema(database);
  const now = new Date().toISOString();
  const values: [string, string, string, string, string, string, string, string, string] = [
    body.intake.profession.trim(),
    body.intake.job_title.trim(),
    body.intake.company_name.trim(),
    body.intake.website_or_public_profile_url.trim(),
    body.intake.competitor_used.trim(),
    body.intake.offer_or_lead_type.trim(),
    body.intake.industry.trim(),
    body.intake.country_region.trim(),
    body.intake.target_age_range.trim(),
  ];
  const requestedId = body.id ?? "";
  let brandId = body.brand_id ?? "";
  let id = requestedId;
  if (requestedId) {
    const existing = await database.prepare("SELECT id, brand_id FROM research_profiles WHERE id = ? AND owner_email = ?")
      .bind(requestedId, owner).all<{ id: string; brand_id: string }>();
    if (!existing.results?.length) {
      return Response.json({ error: "The selected research set no longer exists." }, { status: 404 });
    }
    brandId = existing.results[0].brand_id;
    await database.batch([
      database.prepare(`
        UPDATE research_profiles
        SET company_name = ?, website_or_public_profile_url = ?, industry = ?, country_region = ?, updated_at = ?
        WHERE brand_id = ? AND owner_email = ?
      `).bind(values[2], values[3], values[6], values[7], now, brandId, owner),
      database.prepare(`
        UPDATE research_profiles
        SET profession = ?, job_title = ?, competitor_used = ?, offer_or_lead_type = ?, target_age_range = ?, updated_at = ?
        WHERE id = ? AND owner_email = ?
      `).bind(values[0], values[1], values[4], values[5], values[8], now, id, owner),
    ]);
  } else {
    if (brandId) {
      const existingBrand = await database.prepare(`
        SELECT brand_id, company_name, website_or_public_profile_url, industry, country_region
        FROM research_profiles WHERE brand_id = ? AND owner_email = ? LIMIT 1
      `).bind(brandId, owner).all<Pick<ResearchProfile, "brand_id" | "company_name" | "website_or_public_profile_url" | "industry" | "country_region">>();
      if (!existingBrand.results?.length) return Response.json({ error: "The selected brand no longer exists." }, { status: 404 });
      const shared = existingBrand.results[0];
      values[2] = shared.company_name;
      values[3] = shared.website_or_public_profile_url;
      values[6] = shared.industry;
      values[7] = shared.country_region;
    } else {
      brandId = crypto.randomUUID();
    }
    const duplicate = await database.prepare(`
      SELECT id FROM research_profiles
      WHERE owner_email = ? AND brand_id = ? AND profession = ? AND job_title = ? AND company_name = ?
        AND website_or_public_profile_url = ? AND competitor_used = ?
        AND offer_or_lead_type = ? AND industry = ? AND country_region = ? AND target_age_range = ?
      LIMIT 1
    `).bind(owner, brandId, ...values).all<{ id: string }>();
    id = duplicate.results?.[0]?.id ?? crypto.randomUUID();
    if (duplicate.results?.length) {
      await database.prepare("UPDATE research_profiles SET updated_at = ? WHERE id = ? AND owner_email = ?")
        .bind(now, id, owner).run();
    } else {
      await database.prepare(`
        INSERT INTO research_profiles (
          id, brand_id, owner_email, profession, job_title, company_name, website_or_public_profile_url,
          competitor_used, offer_or_lead_type, industry, country_region, target_age_range,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, brandId, owner, ...values, now, now).run();
    }
  }
  return Response.json({ id, brand_id: brandId, updated_at: now }, { headers: { "cache-control": "no-store" } });
}

export async function DELETE(request: Request): Promise<Response> {
  if (!mutationAllowed(request)) return Response.json({ error: "A same-origin request is required." }, { status: 403 });
  const owner = authenticatedOwner(request);
  if (!owner) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const database = await getDatabase();
  if (!database) return Response.json({ error: STORAGE_BLOCKER }, { status: 503 });
  let id: string;
  try {
    const body = await boundedJson(request);
    if (!isRecord(body) || Object.keys(body).join(",") !== "id") throw new Error("Invalid delete request.");
    id = optionalRecordId(body.id);
    if (!id) throw new Error("Missing record identity.");
  } catch {
    return Response.json({ error: "Choose a saved offer." }, { status: 400 });
  }
  await ensureResearchSchema(database);
  await database.batch([
    database.prepare("DELETE FROM research_messages WHERE profile_id = ? AND owner_email = ?").bind(id, owner),
    database.prepare("DELETE FROM research_revisions WHERE profile_id = ? AND owner_email = ?").bind(id, owner),
    database.prepare("DELETE FROM research_workspaces WHERE profile_id = ? AND owner_email = ?").bind(id, owner),
    database.prepare("DELETE FROM research_profiles WHERE id = ? AND owner_email = ?").bind(id, owner),
  ]);
  return Response.json({ deleted: true }, { headers: { "cache-control": "no-store" } });
}
