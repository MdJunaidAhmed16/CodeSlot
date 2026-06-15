// GET /fx-rate — public. Returns today's USD→INR rate (cached) so the portal
// shows and converts amounts at the same rate the backend charges at.
import { error, handleOptions, json } from "../_shared/http.ts";
import { getUsdInrRate } from "../_shared/fx.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "GET") return error("method not allowed", 405);
  const rate = await getUsdInrRate();
  return json({ usd_inr: rate });
});
