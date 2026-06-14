// GET /balance   (requires Authorization: Bearer <session token>)
// Returns the authenticated user's balance, lifetime totals, today's stats, and
// a short recent-activity list (advertiser names + event types only).
import { error, handleOptions, json } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { verifyRequest } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "GET") return error("method not allowed", 405);

  const claims = await verifyRequest(req);
  if (!claims) return error("authentication required", 401);
  const userId = claims.sub;

  const db = serviceClient();

  const { data: balData } = await db.rpc("current_balance", { p_user: userId });
  const balance = Number(balData) || 0;

  const { data: ledger } = await db
    .from("credit_ledger")
    .select("amount")
    .eq("user_id", userId);

  let earned = 0;
  let redeemed = 0;
  for (const row of ledger ?? []) {
    const amt = Number((row as { amount: number }).amount) || 0;
    if (amt >= 0) earned += amt;
    else redeemed += -amt;
  }

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { data: recentRows } = await db
    .from("impressions")
    .select("event_type, credits_awarded, created_at, ads(advertiser_name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  let impressions = 0;
  let clicks = 0;
  let earnedToday = 0;
  const recent: RecentEvent[] = [];
  for (const r of recentRows ?? []) {
    const row = r as RecentRow;
    const when = new Date(row.created_at);
    if (when >= startOfDay) {
      if (row.event_type === "click") clicks++;
      else impressions++;
      earnedToday += Number(row.credits_awarded) || 0;
    }
    if (recent.length < 10) {
      recent.push({
        advertiser_name: row.ads?.advertiser_name ?? "Sponsor",
        event_type: row.event_type,
        credits_awarded: Number(row.credits_awarded) || 0,
        created_at: row.created_at,
      });
    }
  }

  return json({
    balance,
    lifetime_earned: earned,
    lifetime_redeemed: redeemed,
    stats_today: { impressions, clicks, earned: earnedToday },
    recent,
  });
});

interface RecentRow {
  event_type: "impression" | "click";
  credits_awarded: number;
  created_at: string;
  ads: { advertiser_name: string } | null;
}
interface RecentEvent {
  advertiser_name: string;
  event_type: "impression" | "click";
  credits_awarded: number;
  created_at: string;
}
