// Admin ad management (admin-gated).
//   GET   /admin-ads           → list ads with metrics
//   POST  /admin-ads           → create an ad
//   PATCH /admin-ads           → update an ad (by id) — incl. toggle active, top-up budget
import { error, handleOptions, isSafeHttpUrl, json, readJson } from "../_shared/http.ts";
import { requireAdmin } from "../_shared/admin.ts";

const HEX = /^#[0-9a-fA-F]{3,8}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();

  const ctx = await requireAdmin(req);
  if (ctx instanceof Response) return ctx;
  const { db } = ctx;

  if (req.method === "GET") {
    const { data, error: e } = await db
      .from("ad_metrics")
      .select("*")
      .order("impressions", { ascending: false });
    if (e) return error("could not load ads", 500);
    return json({ ads: data ?? [] });
  }

  if (req.method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = await readJson(req);
    } catch (e) {
      return error(e instanceof Error ? e.message : "bad request", 400);
    }
    const v = validateAd(body);
    if ("error" in v) return error(v.error, 400);

    const { data, error: e } = await db.from("ads").insert(v.row).select().single();
    if (e) return error("could not create ad", 500);
    return json({ ad: data });
  }

  if (req.method === "PATCH") {
    let body: Record<string, unknown>;
    try {
      body = await readJson(req);
    } catch (e) {
      return error(e instanceof Error ? e.message : "bad request", 400);
    }
    const id = body.id;
    if (typeof id !== "string") return error("invalid id", 400);

    // Only a whitelist of fields may be patched.
    const patch: Record<string, unknown> = {};
    if (typeof body.active === "boolean") patch.active = body.active;
    if (typeof body.weight === "number" && body.weight >= 0) patch.weight = Math.floor(body.weight);
    if (typeof body.budget_remaining === "number" && body.budget_remaining >= 0) {
      patch.budget_remaining = body.budget_remaining;
    }
    if (typeof body.text === "string" && body.text.length <= 120) patch.text = body.text;
    if (typeof body.description === "string") patch.description = body.description;
    if (typeof body.url === "string") {
      if (!isSafeHttpUrl(body.url)) return error("invalid url", 400);
      patch.url = body.url;
    }
    if (Object.keys(patch).length === 0) return error("nothing to update", 400);

    const { data, error: e } = await db.from("ads").update(patch).eq("id", id).select().single();
    if (e) return error("could not update ad", 500);
    return json({ ad: data });
  }

  return error("method not allowed", 405);
});

function validateAd(
  b: Record<string, unknown>
): { row: Record<string, unknown> } | { error: string } {
  const name = b.advertiser_name;
  const text = b.text;
  const url = b.url;
  if (typeof name !== "string" || name.length === 0 || name.length > 80) {
    return { error: "advertiser_name required (<=80 chars)" };
  }
  if (typeof text !== "string" || text.length === 0 || text.length > 120) {
    return { error: "text required (<=120 chars)" };
  }
  if (!isSafeHttpUrl(url)) return { error: "url must be http(s)" };

  const row: Record<string, unknown> = {
    advertiser_name: name,
    text,
    url,
    active: b.active === false ? false : true,
  };
  if (typeof b.description === "string") row.description = b.description;
  if (typeof b.brand_color === "string" && HEX.test(b.brand_color)) row.brand_color = b.brand_color;
  if (typeof b.logo_url === "string" && /^https:\/\//.test(b.logo_url)) row.logo_url = b.logo_url;
  if (typeof b.weight === "number" && b.weight >= 0) row.weight = Math.floor(b.weight);
  if (typeof b.budget_remaining === "number" && b.budget_remaining >= 0) {
    row.budget_remaining = b.budget_remaining;
  }
  if (typeof b.cost_per_impression === "number" && b.cost_per_impression >= 0) {
    row.cost_per_impression = b.cost_per_impression;
  }
  if (typeof b.cost_per_click === "number" && b.cost_per_click >= 0) {
    row.cost_per_click = b.cost_per_click;
  }
  return { row };
}
