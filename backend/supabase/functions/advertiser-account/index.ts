// Advertiser account (Supabase-Auth gated).
//   GET  /advertiser-account  → profile details
//   POST /advertiser-account  { action: "delete" } → hard-delete the account
import { error, handleOptions, json, readJson } from "../_shared/http.ts";
import { requireAdvertiser } from "../_shared/advertiser.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();

  const ctx = await requireAdvertiser(req);
  if (ctx instanceof Response) return ctx;
  const { db, advertiserId, authUserId, email, provider } = ctx;

  if (req.method === "GET") {
    const { data: adv } = await db
      .from("advertisers")
      .select("name, email, provider, wallet_usd, created_at")
      .eq("id", advertiserId)
      .single();
    const { count } = await db
      .from("ads")
      .select("*", { count: "exact", head: true })
      .eq("advertiser_id", advertiserId);
    return json({
      email: adv?.email ?? email,
      name: adv?.name ?? null,
      provider: adv?.provider ?? provider,
      wallet_usd: Number(adv?.wallet_usd ?? 0),
      created_at: adv?.created_at ?? null,
      campaigns: count ?? 0,
    });
  }

  if (req.method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = await readJson(req);
    } catch (e) {
      return error(e instanceof Error ? e.message : "bad request", 400);
    }
    if (body.action !== "delete") return error("unknown action", 400);

    // Remove the advertiser row (cascades to their ads + payments), then the
    // Supabase Auth user so the login is fully gone.
    const { error: delErr } = await db.from("advertisers").delete().eq("id", advertiserId);
    if (delErr) return error("could not delete account", 500);
    try {
      await db.auth.admin.deleteUser(authUserId);
    } catch {
      // Non-fatal: profile/data already removed; the empty auth user is harmless.
    }
    return json({ success: true });
  }

  return error("method not allowed", 405);
});
