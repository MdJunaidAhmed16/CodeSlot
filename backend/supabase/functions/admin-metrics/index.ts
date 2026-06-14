// GET /admin-metrics  (admin-gated) → platform overview for the dashboard.
import { error, handleOptions, json } from "../_shared/http.ts";
import { requireOwner } from "../_shared/admin.ts";
import { creditsToUsd } from "../_shared/economics.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "GET") return error("method not allowed", 405);

  // Platform/financial data is owner-only.
  const ctx = await requireOwner(req);
  if (ctx instanceof Response) return ctx;
  const { db } = ctx;

  // Aggregate from the ad_metrics view.
  const { data: metrics, error: e } = await db.from("ad_metrics").select("*");
  if (e) return error("could not load metrics", 500);

  let impressions = 0;
  let clicks = 0;
  let spend = 0;
  for (const m of metrics ?? []) {
    impressions += Number(m.impressions) || 0;
    clicks += Number(m.clicks) || 0;
    spend += Number(m.spend) || 0;
  }
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

  const { count: userCount } = await db
    .from("users")
    .select("*", { count: "exact", head: true });

  // Total credits earned (sum of positive ledger amounts).
  const { data: earned } = await db
    .from("credit_ledger")
    .select("amount")
    .gt("amount", 0);
  const creditsEarned = (earned ?? []).reduce(
    (s, r) => s + (Number((r as { amount: number }).amount) || 0),
    0
  );

  // Total credits redeemed (sum of |negative| redemption ledger amounts).
  const { data: redeemed } = await db
    .from("credit_ledger")
    .select("amount")
    .eq("reason", "redemption");
  const creditsRedeemed = (redeemed ?? []).reduce(
    (s, r) => s - (Number((r as { amount: number }).amount) || 0),
    0
  );

  const { count: redemptionCount } = await db
    .from("redemptions")
    .select("*", { count: "exact", head: true })
    .eq("status", "completed");

  const totalCampaigns = (metrics ?? []).length;
  const activeCampaigns = (metrics ?? []).filter((m) => m.active).length;

  // Kill-switch state.
  const { data: flag } = await db
    .from("feature_flags")
    .select("value")
    .eq("key", "ad_serving_enabled")
    .maybeSingle();

  return json({
    totals: {
      spend: round2(spend),
      impressions,
      clicks,
      ctr: round2(ctr),
      users: userCount ?? 0,
      payout_usd: round2(creditsToUsd(creditsEarned)),
      margin_usd: round2(spend - creditsToUsd(creditsEarned)),
      // Owner / platform KPIs:
      credits_earned: creditsEarned,
      credits_redeemed: creditsRedeemed,
      earned_usd: round2(creditsToUsd(creditsEarned)),
      redeemed_usd: round2(creditsToUsd(creditsRedeemed)),
      // Credits accrued but not yet redeemed — a liability on the books.
      outstanding_usd: round2(creditsToUsd(creditsEarned - creditsRedeemed)),
      redemptions: redemptionCount ?? 0,
      total_campaigns: totalCampaigns,
      active_campaigns: activeCampaigns,
    },
    ad_serving_enabled: flag ? flag.value !== false : true,
    campaigns: (metrics ?? []).map((m) => ({
      id: m.id,
      advertiser_name: m.advertiser_name,
      text: m.text,
      active: m.active,
      impressions: Number(m.impressions) || 0,
      clicks: Number(m.clicks) || 0,
      spend: round2(Number(m.spend) || 0),
      budget_remaining: round2(Number(m.budget_remaining) || 0),
    })),
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
