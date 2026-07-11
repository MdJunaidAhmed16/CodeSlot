// GET /session   (requires Authorization: Bearer <session token>)
//
// Lightweight liveness/state poll for the extension. Unlike the other
// authenticated endpoints, this one confirms the user ROW still exists and is
// not banned - so a deleted/banned account gets a 401, which the extension
// turns into an automatic sign-out. Also returns the current balance, admission
// status, and the global ad kill switch, so the extension reflects server-side
// changes within one poll interval (near real-time) without a restart.
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

  // The token is signed & unexpired, but the account may have been deleted or
  // banned since it was issued. Treat both as "session no longer valid" -> 401.
  const { data: user } = await db
    .from("users")
    .select("banned, status")
    .eq("id", userId)
    .maybeSingle();
  if (!user || user.banned) {
    return error("session no longer valid", 401);
  }

  const { data: balData } = await db.rpc("current_balance", { p_user: userId });

  const { data: flag } = await db
    .from("feature_flags")
    .select("value")
    .eq("key", "ad_serving_enabled")
    .maybeSingle();

  return json({
    status: user.status ?? "active",
    balance: Number(balData) || 0,
    ad_serving_enabled: flag ? flag.value !== false : true,
  });
});
