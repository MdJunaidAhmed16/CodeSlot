// Advertiser analytics (Supabase-Auth gated).
//   GET /advertiser-analytics?days=30  → a daily impressions/clicks/spend
//   series for the advertiser's whole account, plus window totals. Powers the
//   over-time charts in the portal. The heavy lifting (grouping + zero-filling
//   gaps) is done by the advertiser_daily_metrics SQL function.
import { error, handleOptions, json } from "../_shared/http.ts";
import { requireAdvertiser } from "../_shared/advertiser.ts";

const ALLOWED_DAYS = new Set([7, 30, 90]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "GET") return error("method not allowed", 405);

  const ctx = await requireAdvertiser(req);
  if (ctx instanceof Response) return ctx;
  const { db, advertiserId } = ctx;

  const url = new URL(req.url);
  let days = Number(url.searchParams.get("days") ?? 30);
  if (!ALLOWED_DAYS.has(days)) days = 30;

  const { data, error: e } = await db.rpc("advertiser_daily_metrics", {
    p_advertiser: advertiserId,
    p_days: days,
  });
  if (e) return error("could not load analytics", 500);

  const series = (data ?? []).map((r: Record<string, unknown>) => ({
    day: String(r.day),
    impressions: Number(r.impressions ?? 0),
    clicks: Number(r.clicks ?? 0),
    spend_usd: Number(r.spend_usd ?? 0),
  }));

  const impressions = series.reduce((s, r) => s + r.impressions, 0);
  const clicks = series.reduce((s, r) => s + r.clicks, 0);
  const spend_usd = Math.round(series.reduce((s, r) => s + r.spend_usd, 0) * 100) / 100;

  return json({
    days,
    series,
    totals: {
      impressions,
      clicks,
      spend_usd,
      ctr: impressions ? Math.round((clicks / impressions) * 10000) / 100 : 0,
    },
  });
});
