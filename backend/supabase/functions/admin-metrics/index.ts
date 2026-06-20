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

  // Treasury (real cash positions)
  // Cash collected from advertisers (held in your Stripe/Razorpay balance).
  const { data: paidRows } = await db
    .from("payments").select("amount_usd").eq("status", "paid");
  const collected = sumUsd(paidRows, "amount_usd");

  // Cash spent on OpenRouter (key provisioning at redemption).
  const { data: orRows } = await db
    .from("redemptions").select("openrouter_amount").eq("status", "completed");
  const openrouterSpent = sumUsd(orRows, "openrouter_amount");

  // Money still owed to advertisers: unspent wallet + undelivered campaign
  // budget - but ONLY for advertiser-funded campaigns (house/owner ads with
  // advertiser_id = null carry no real liability).
  const { data: walletRows } = await db.from("advertisers").select("wallet_usd");
  const { data: budgetRows } = await db
    .from("ads").select("budget_remaining")
    .not("advertiser_id", "is", null)
    .neq("status", "rejected");
  const advertiserFloat =
    sumUsd(walletRows, "wallet_usd") + sumUsd(budgetRows, "budget_remaining");

  // Future OpenRouter cost owed to developers (earned but not yet redeemed).
  const devLiability = creditsToUsd(creditsEarned - creditsRedeemed);

  const netCash = round2(collected - openrouterSpent);
  const distributable = round2(collected - openrouterSpent - advertiserFloat - devLiability);

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
      // Credits accrued but not yet redeemed - a liability on the books.
      outstanding_usd: round2(creditsToUsd(creditsEarned - creditsRedeemed)),
      redemptions: redemptionCount ?? 0,
      total_campaigns: totalCampaigns,
      active_campaigns: activeCampaigns,
    },
    treasury: {
      collected_usd: round2(collected),          // cash in (Stripe/Razorpay balance)
      openrouter_spent_usd: round2(openrouterSpent), // cash out (OpenRouter)
      net_cash_usd: netCash,                       // in - out
      advertiser_float_usd: round2(advertiserFloat), // owed to advertisers (unspent)
      dev_liability_usd: round2(devLiability),     // future OpenRouter cost (unredeemed credits)
      distributable_usd: distributable,            // safe-to-withdraw profit
    },
    ad_serving_enabled: flag ? flag.value !== false : true,
    flagged_campaigns: (metrics ?? []).filter((m) => m.review_flag).length,
    campaigns: (metrics ?? []).map((m) => ({
      id: m.id,
      advertiser_name: m.advertiser_name,
      text: m.text,
      active: m.active,
      status: m.status,
      review_flag: m.review_flag ?? null,
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

// deno-lint-ignore no-explicit-any
function sumUsd(rows: any[] | null, field: string): number {
  return (rows ?? []).reduce((s, r) => s + (Number(r[field]) || 0), 0);
}
