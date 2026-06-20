// Advertiser campaign management (Supabase-Auth gated).
//   GET  /advertiser-campaigns  → the advertiser's own campaigns + profile
//   POST /advertiser-campaigns  → submit a campaign; auto-moderated, then
//                                 approved (live) or rejected with a reason.
import { error, handleOptions, isSafeHttpUrl, json, readJson } from "../_shared/http.ts";
import { requireAdvertiser } from "../_shared/advertiser.ts";
import { moderateAd } from "../_shared/moderation.ts";
import { ratesFor, type BillingModel } from "../_shared/economics.ts";

const HEX = /^#[0-9a-fA-F]{3,8}$/;
const MAX_BUDGET = 100000; // USD ceiling per submission (sanity bound)

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();

  const ctx = await requireAdvertiser(req);
  if (ctx instanceof Response) return ctx;
  const { db, advertiserId } = ctx;

  if (req.method === "GET") {
    const { data, error: e } = await db
      .from("ads")
      .select(
        "id, advertiser_name, text, url, description, brand_color, logo_url, billing_model, status, moderation_reason, active, weight, budget_remaining, cost_per_impression, cost_per_click, created_at"
      )
      .eq("advertiser_id", advertiserId)
      .order("created_at", { ascending: false });
    if (e) return error("could not load campaigns", 500);

    // Merge in lifetime impressions/clicks/spend per campaign from ad_metrics.
    const { data: metrics } = await db
      .from("ad_metrics")
      .select("id, impressions, clicks, spend")
      .eq("advertiser_id", advertiserId);
    const byId = new Map((metrics ?? []).map((m) => [m.id, m]));
    const campaigns = (data ?? []).map((c) => {
      const m = byId.get(c.id);
      return {
        ...c,
        impressions: Number(m?.impressions ?? 0),
        clicks: Number(m?.clicks ?? 0),
        spend: Number(m?.spend ?? 0),
      };
    });

    // Include the wallet balance + currency lock + recent top-ups for the portal.
    const { data: adv } = await db
      .from("advertisers")
      .select("wallet_usd, email, name, currency_pref, currency_pref_set_at, fx_rate_locked")
      .eq("id", advertiserId)
      .single();
    const { data: payments } = await db
      .from("payments")
      .select("provider, currency, amount_minor, amount_usd, status, created_at")
      .eq("advertiser_id", advertiserId)
      .order("created_at", { ascending: false })
      .limit(10);

    return json({
      campaigns,
      wallet_usd: Number(adv?.wallet_usd ?? 0),
      email: adv?.email ?? null,
      currency_pref: adv?.currency_pref ?? null,
      currency_pref_set_at: adv?.currency_pref_set_at ?? null,
      fx_rate_locked: adv?.fx_rate_locked != null ? Number(adv.fx_rate_locked) : null,
      payments: payments ?? [],
    });
  }

  if (req.method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = await readJson(req);
    } catch (e) {
      return error(e instanceof Error ? e.message : "bad request", 400);
    }

    // --- Structural validation ---
    const advertiser_name = String(body.advertiser_name ?? "").trim();
    const text = String(body.text ?? "").trim();
    const url = String(body.url ?? "").trim();
    const description = body.description ? String(body.description).trim() : undefined;

    if (advertiser_name.length === 0 || advertiser_name.length > 80) {
      return error("advertiser_name is required (<=80 chars)", 400);
    }
    if (text.length === 0 || text.length > 120) {
      return error("ad text is required (<=120 chars)", 400);
    }
    if (!isSafeHttpUrl(url)) return error("a valid destination URL is required", 400);

    const billing_model: BillingModel = body.billing_model === "cpc" ? "cpc" : "cpm";
    const rates = ratesFor(billing_model);
    const budget = clampNum(body.budget_remaining, 0, MAX_BUDGET);
    const brand_color =
      typeof body.brand_color === "string" && HEX.test(body.brand_color)
        ? body.brand_color
        : null;
    const logo_url =
      typeof body.logo_url === "string" && /^https:\/\//.test(body.logo_url)
        ? body.logo_url
        : null;

    // --- Auto-moderation (the strong backend screen) ---
    const verdict = await moderateAd({ advertiser_name, text, description, url });
    const approved = verdict.ok;

    // Fund an APPROVED campaign from the prepaid wallet (atomic). Rejected
    // campaigns are recorded unfunded and never serve.
    if (approved && budget > 0) {
      const { data: ok, error: spendErr } = await db.rpc("spend_wallet", {
        p_advertiser: advertiserId,
        p_amount: budget,
      });
      if (spendErr) return error("could not reserve budget", 500);
      if (ok !== true) {
        return error("insufficient wallet balance - add funds to launch this campaign", 402);
      }
    }

    const { data, error: e } = await db
      .from("ads")
      .insert({
        advertiser_id: advertiserId,
        advertiser_name,
        text,
        url,
        description,
        brand_color,
        logo_url,
        billing_model,
        cost_per_impression: rates.cost_per_impression,
        reward_per_impression: rates.reward_per_impression,
        cost_per_click: rates.cost_per_click,
        reward_per_click: rates.reward_per_click,
        budget_remaining: approved ? budget : 0,
        status: approved ? "approved" : "rejected",
        active: approved,
        moderation_reason: approved ? null : verdict.reason,
        review_flag: approved ? (verdict.flag ?? null) : null,
      })
      .select("id, status, moderation_reason, review_flag")
      .single();

    if (e) {
      // Refund the wallet hold if the campaign insert failed.
      if (approved && budget > 0) {
        await db.rpc("add_wallet", { p_advertiser: advertiserId, p_amount: budget });
      }
      return error("could not submit campaign", 500);
    }

    return json({
      campaign: data,
      approved,
      reason: approved ? null : verdict.reason,
    });
  }

  // Edit / pause-resume / top-up (re-moderates if content changes)
  if (req.method === "PATCH") {
    let body: Record<string, unknown>;
    try {
      body = await readJson(req);
    } catch (e) {
      return error(e instanceof Error ? e.message : "bad request", 400);
    }
    const id = body.id;
    if (typeof id !== "string") return error("invalid id", 400);

    // Ownership check.
    const { data: ad } = await db
      .from("ads").select("*").eq("id", id).eq("advertiser_id", advertiserId).single();
    if (!ad) return error("campaign not found", 404);

    const patch: Record<string, unknown> = {};
    if (typeof body.active === "boolean") patch.active = body.active;
    if (typeof body.text === "string") {
      if (body.text.trim().length === 0 || body.text.length > 120) return error("ad text must be 1-120 chars", 400);
      patch.text = body.text.trim();
    }
    if (typeof body.description === "string") patch.description = body.description.trim();
    if (typeof body.url === "string") {
      if (!isSafeHttpUrl(body.url)) return error("invalid url", 400);
      patch.url = body.url.trim();
    }
    if (typeof body.brand_color === "string") patch.brand_color = HEX.test(body.brand_color) ? body.brand_color : null;
    if (typeof body.logo_url === "string") patch.logo_url = /^https:\/\//.test(body.logo_url) ? body.logo_url : null;

    // Re-moderate when the ad's content/destination changed.
    const contentChanged = patch.text !== undefined || patch.url !== undefined || patch.description !== undefined;
    if (contentChanged) {
      const verdict = await moderateAd({
        advertiser_name: ad.advertiser_name,
        text: (patch.text as string) ?? ad.text,
        description: (patch.description as string) ?? ad.description,
        url: (patch.url as string) ?? ad.url,
      });
      if (!verdict.ok) {
        patch.status = "rejected";
        patch.active = false;
        patch.moderation_reason = verdict.reason;
        patch.review_flag = null;
      } else {
        patch.status = "approved";
        patch.moderation_reason = null;
        patch.review_flag = verdict.flag ?? null;
        if (patch.active === undefined) patch.active = ad.active;
      }
    }

    // Optional budget top-up from the wallet.
    const addBudget = clampNum(body.add_budget, 0, MAX_BUDGET);
    if (addBudget > 0) {
      const { data: ok } = await db.rpc("spend_wallet", { p_advertiser: advertiserId, p_amount: addBudget });
      if (ok !== true) return error("insufficient wallet balance", 402);
      patch.budget_remaining = Number(ad.budget_remaining) + addBudget;
    }

    if (Object.keys(patch).length === 0) return error("nothing to update", 400);

    const { data, error: e } = await db
      .from("ads").update(patch).eq("id", id)
      .select("id, status, moderation_reason, review_flag, active").single();
    if (e) {
      if (addBudget > 0) await db.rpc("add_wallet", { p_advertiser: advertiserId, p_amount: addBudget });
      return error("could not update campaign", 500);
    }
    return json({ campaign: data, approved: patch.status !== "rejected", reason: (patch.moderation_reason as string) ?? null });
  }

  // Delete (refunds remaining budget to the wallet)
  if (req.method === "DELETE") {
    let body: Record<string, unknown>;
    try {
      body = await readJson(req);
    } catch (e) {
      return error(e instanceof Error ? e.message : "bad request", 400);
    }
    const id = body.id;
    if (typeof id !== "string") return error("invalid id", 400);

    const { data: ad } = await db
      .from("ads").select("budget_remaining").eq("id", id).eq("advertiser_id", advertiserId).single();
    if (!ad) return error("campaign not found", 404);

    const refund = Number(ad.budget_remaining) || 0;
    const { error: delErr } = await db.from("ads").delete().eq("id", id);
    if (delErr) return error("could not delete campaign", 500);
    if (refund > 0) await db.rpc("add_wallet", { p_advertiser: advertiserId, p_amount: refund });
    return json({ success: true, refunded: refund });
  }

  return error("method not allowed", 405);
});

function clampNum(v: unknown, lo: number, hi: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.min(Math.max(n, lo), hi);
}
