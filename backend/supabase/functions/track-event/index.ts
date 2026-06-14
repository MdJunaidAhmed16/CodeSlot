// POST /track-event   (requires Authorization: Bearer <session token>)
// Body: { ad_id, event_type, idempotency_key, client_ts }
//
// The user is derived from the verified session token — NOT from the body — so
// events can only ever be attributed to the authenticated GitHub-backed user.
import { error, handleOptions, isUuid, json, readJson } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { allow, firstWithin } from "../_shared/ratelimit.ts";
import { verifyRequest } from "../_shared/auth.ts";

const IMPRESSION_COOLDOWN_SEC = 240; // max 1 credited impression / ad / 4 min
const HOURLY_EVENT_LIMIT = 60; // total events per user per hour

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return error("method not allowed", 405);

  const claims = await verifyRequest(req);
  if (!claims) return error("authentication required", 401);
  const userId = claims.sub;

  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
  } catch (e) {
    return error(e instanceof Error ? e.message : "bad request", 400);
  }

  const adId = body.ad_id;
  const eventType = body.event_type;
  const idem = body.idempotency_key;

  if (!isUuid(adId)) return error("invalid ad_id", 400);
  if (!isUuid(idem)) return error("invalid idempotency_key", 400);
  if (eventType !== "impression" && eventType !== "click") {
    return error("invalid event_type", 400);
  }

  // Global hourly throttle per user.
  if (!(await allow(`rl:evt:${userId}`, HOURLY_EVENT_LIMIT, 3600))) {
    return error("rate limited", 429);
  }

  const db = serviceClient();

  if (eventType === "impression") {
    const fresh = await firstWithin(
      `freq:${userId}:${adId}`,
      IMPRESSION_COOLDOWN_SEC
    );
    if (!fresh) {
      const { data } = await db.rpc("current_balance", { p_user: userId });
      return json({
        success: true,
        credits_earned: 0,
        new_balance: Number(data) || 0,
      });
    }
  }

  const { data, error: rpcErr } = await db.rpc("record_event", {
    p_user: userId,
    p_ad: adId,
    p_event: eventType,
    p_idem: idem,
  });

  if (rpcErr) {
    return error("could not record event", 409);
  }

  const row = Array.isArray(data) ? data[0] : data;
  return json({
    success: true,
    credits_earned: Number(row?.credits_earned) || 0,
    new_balance: Number(row?.new_balance) || 0,
  });
});
