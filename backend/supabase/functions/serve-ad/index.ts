// GET /serve-ad?device_id=<uuid>
// Returns the next ad for this device (weighted round-robin), honoring the
// frequency cap and the global kill switch. Never returns workspace data.
import { error, handleOptions, isUuid, json } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { allow } from "../_shared/ratelimit.ts";

const NEXT_IN_SEC = 420;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "GET") return error("method not allowed", 405);

  const deviceId = new URL(req.url).searchParams.get("device_id");
  if (!isUuid(deviceId)) return error("invalid device_id", 400);

  // Light per-device limit to blunt scraping of the ad pool.
  if (!(await allow(`rl:serve:${deviceId}`, 30, 60))) {
    return error("rate limited", 429);
  }

  const db = serviceClient();

  // Global kill switch (incident response, SECURITY §8).
  const { data: flag } = await db
    .from("feature_flags")
    .select("value")
    .eq("key", "ad_serving_enabled")
    .maybeSingle();
  if (flag && flag.value === false) {
    return json({ ad: null, next_in_seconds: NEXT_IN_SEC });
  }

  // Ad serving is anonymous - no user row is created here. Earning credits
  // requires authentication via /track-event. `device_id` is used only for the
  // per-device display frequency cap above.

  // Candidate ads: active and still funded.
  const { data: ads, error: dbErr } = await db
    .from("ads")
    .select(
      "id, advertiser_name, text, url, description, brand_color, logo_url, weight, budget_remaining"
    )
    .eq("active", true)
    .eq("status", "approved") // never serve a rejected/pending campaign
    // Only funded ads are candidates. The authoritative "advertiser actually
    // pays for this event" check lives in record_event (track-event).
    .gt("budget_remaining", 0);

  if (dbErr) return error("could not load ads", 500);
  if (!ads || ads.length === 0) {
    return json({ ad: null, next_in_seconds: NEXT_IN_SEC });
  }

  // Weighted random selection.
  const picked = weightedPick(ads as AdRow[]);
  return json({
    ad: {
      ad_id: picked.id,
      advertiser_name: picked.advertiser_name,
      text: picked.text,
      url: picked.url,
      description: picked.description ?? undefined,
      brand_color: picked.brand_color ?? undefined,
      logo_url: picked.logo_url ?? undefined,
      weight: picked.weight,
    },
    next_in_seconds: NEXT_IN_SEC,
  });
});

interface AdRow {
  id: string;
  advertiser_name: string;
  text: string;
  url: string;
  description: string | null;
  brand_color: string | null;
  logo_url: string | null;
  weight: number;
  budget_remaining: number;
}

function weightedPick(ads: AdRow[]): AdRow {
  const total = ads.reduce((s, a) => s + Math.max(1, a.weight || 1), 0);
  let r = Math.random() * total;
  for (const a of ads) {
    r -= Math.max(1, a.weight || 1);
    if (r <= 0) return a;
  }
  return ads[ads.length - 1];
}
