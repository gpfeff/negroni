import type { IntelligenceIntake, ProfilesResponse, ResearchProfile } from "@/lib/intelligence/contracts";
import { authenticatedOwner } from "@/lib/authenticated-user";
import { ensureResearchSchema, getDatabase } from "@/lib/database";
import { validateIntake } from "@/lib/intelligence/validation";

const STORAGE_BLOCKER = "Saved research sets are unavailable until the site database is configured.";

export async function GET(request: Request): Promise<Response> {
  const owner = authenticatedOwner(request);
  if (!owner) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const database = await getDatabase();
  if (!database) {
    const response: ProfilesResponse = { available: false, records: [], blocker: STORAGE_BLOCKER };
    return Response.json(response, { headers: { "cache-control": "no-store" } });
  }
  await ensureResearchSchema(database);
  const rows = await database.prepare(`
    SELECT id, client_customer_name, profession_job_title, company_name, website_or_public_profile_url,
      service_or_offer_purchased, competitor_used, offer_or_lead_type, industry, country_region,
      target_age_range, created_at, updated_at
    FROM research_profiles
    WHERE owner_email = ?
    ORDER BY updated_at DESC
    LIMIT 100
  `).bind(owner).all<ResearchProfile>();
  const response: ProfilesResponse = { available: true, records: rows.results ?? [], blocker: null };
  return Response.json(response, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const owner = authenticatedOwner(request);
  if (!owner) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const database = await getDatabase();
  if (!database) return Response.json({ error: STORAGE_BLOCKER }, { status: 503 });
  const body = await request.json() as { id?: string; intake?: IntelligenceIntake };
  if (!body.intake) return Response.json({ error: "The research set is missing." }, { status: 400 });
  const errors = validateIntake(body.intake);
  if (errors.length) return Response.json({ error: errors.join(" ") }, { status: 400 });

  await ensureResearchSchema(database);
  const now = new Date().toISOString();
  const values = [
    body.intake.client_customer_name.trim(),
    body.intake.profession_job_title.trim(),
    body.intake.company_name.trim(),
    body.intake.website_or_public_profile_url.trim(),
    body.intake.service_or_offer_purchased.trim(),
    body.intake.competitor_used.trim(),
    body.intake.offer_or_lead_type.trim(),
    body.intake.industry.trim(),
    body.intake.country_region.trim(),
    body.intake.target_age_range.trim(),
  ] as const;
  const requestedId = body.id?.trim() ?? "";
  let id = requestedId;
  if (requestedId) {
    const existing = await database.prepare("SELECT id FROM research_profiles WHERE id = ? AND owner_email = ?")
      .bind(requestedId, owner).all<{ id: string }>();
    if (!existing.results?.length) {
      return Response.json({ error: "The selected research set no longer exists." }, { status: 404 });
    }
    await database.prepare(`
      UPDATE research_profiles
      SET client_customer_name = ?, profession_job_title = ?, company_name = ?, website_or_public_profile_url = ?,
        service_or_offer_purchased = ?, competitor_used = ?, offer_or_lead_type = ?, industry = ?,
        country_region = ?, target_age_range = ?, updated_at = ?
      WHERE id = ? AND owner_email = ?
    `).bind(
      ...values,
      now,
      id,
      owner,
    ).run();
  } else {
    const duplicate = await database.prepare(`
      SELECT id FROM research_profiles
      WHERE owner_email = ? AND client_customer_name = ? AND profession_job_title = ? AND company_name = ?
        AND website_or_public_profile_url = ? AND service_or_offer_purchased = ? AND competitor_used = ?
        AND offer_or_lead_type = ? AND industry = ? AND country_region = ? AND target_age_range = ?
      LIMIT 1
    `).bind(owner, ...values).all<{ id: string }>();
    id = duplicate.results?.[0]?.id ?? crypto.randomUUID();
    if (duplicate.results?.length) {
      await database.prepare("UPDATE research_profiles SET updated_at = ? WHERE id = ? AND owner_email = ?")
        .bind(now, id, owner).run();
    } else {
      await database.prepare(`
        INSERT INTO research_profiles (
          id, owner_email, client_customer_name, profession_job_title, company_name, website_or_public_profile_url,
          service_or_offer_purchased, competitor_used, offer_or_lead_type, industry, country_region, target_age_range,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, owner, ...values, now, now).run();
    }
  }
  return Response.json({ id, updated_at: now }, { headers: { "cache-control": "no-store" } });
}

export async function DELETE(request: Request): Promise<Response> {
  const owner = authenticatedOwner(request);
  if (!owner) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const database = await getDatabase();
  if (!database) return Response.json({ error: STORAGE_BLOCKER }, { status: 503 });
  const body = await request.json() as { id?: string };
  if (!body.id?.trim()) return Response.json({ error: "Choose a saved research set." }, { status: 400 });
  await ensureResearchSchema(database);
  await database.batch([
    database.prepare("DELETE FROM research_messages WHERE profile_id = ? AND owner_email = ?").bind(body.id, owner),
    database.prepare("DELETE FROM research_revisions WHERE profile_id = ? AND owner_email = ?").bind(body.id, owner),
    database.prepare("DELETE FROM research_workspaces WHERE profile_id = ? AND owner_email = ?").bind(body.id, owner),
    database.prepare("DELETE FROM research_profiles WHERE id = ? AND owner_email = ?").bind(body.id, owner),
  ]);
  return Response.json({ deleted: true }, { headers: { "cache-control": "no-store" } });
}
