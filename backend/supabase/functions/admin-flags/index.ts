// POST /admin-flags  (admin-gated)  Body: { key, value }
// Toggles a feature flag - primarily the `ad_serving_enabled` kill switch.
import { error, handleOptions, json, readJson } from "../_shared/http.ts";
import { requireOwner } from "../_shared/admin.ts";

const ALLOWED_KEYS = new Set(["ad_serving_enabled"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return error("method not allowed", 405);

  // The kill switch is an owner action.
  const ctx = await requireOwner(req);
  if (ctx instanceof Response) return ctx;

  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
  } catch (e) {
    return error(e instanceof Error ? e.message : "bad request", 400);
  }

  const key = body.key;
  const value = body.value;
  if (typeof key !== "string" || !ALLOWED_KEYS.has(key)) {
    return error("unknown flag", 400);
  }
  if (typeof value !== "boolean") return error("value must be boolean", 400);

  const { error: e } = await ctx.db
    .from("feature_flags")
    .upsert({ key, value }, { onConflict: "key" });
  if (e) return error("could not update flag", 500);

  return json({ key, value });
});
