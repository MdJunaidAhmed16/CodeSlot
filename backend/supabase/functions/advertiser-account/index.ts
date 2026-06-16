// Advertiser account (Supabase-Auth gated).
//   GET  /advertiser-account  → profile details (incl. currency lock)
//   POST /advertiser-account  { action: "set_currency", currency } → set the
//                              billing currency (payment rail), locked 30 days.
//                              The FX rate is NOT frozen — top-ups convert live.
//   POST /advertiser-account  { action: "delete" } → hard-delete the account
import { error, handleOptions, json, readJson } from "../_shared/http.ts";
import { requireAdvertiser } from "../_shared/advertiser.ts";

const LOCK_DAYS = 30;
const LOCK_MS = LOCK_DAYS * 24 * 60 * 60 * 1000;

function canChange(setAt: string | null): boolean {
  return !setAt || Date.now() - Date.parse(setAt) >= LOCK_MS;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();

  const ctx = await requireAdvertiser(req);
  if (ctx instanceof Response) return ctx;
  const { db, advertiserId, authUserId, email, provider } = ctx;

  if (req.method === "GET") {
    const { data: adv } = await db
      .from("advertisers")
      .select("name, email, provider, wallet_usd, created_at, currency_pref, currency_pref_set_at, fx_rate_locked")
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
      currency_pref: adv?.currency_pref ?? null,
      currency_pref_set_at: adv?.currency_pref_set_at ?? null,
      fx_rate_locked: adv?.fx_rate_locked != null ? Number(adv.fx_rate_locked) : null,
      currency_locked_days: LOCK_DAYS,
      can_change_currency: canChange(adv?.currency_pref_set_at ?? null),
    });
  }

  if (req.method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = await readJson(req);
    } catch (e) {
      return error(e instanceof Error ? e.message : "bad request", 400);
    }

    if (body.action === "set_currency") {
      const currency = body.currency;
      if (currency !== "usd" && currency !== "inr") return error("invalid currency", 400);

      const { data: adv } = await db
        .from("advertisers").select("currency_pref_set_at").eq("id", advertiserId).single();
      if (!canChange(adv?.currency_pref_set_at ?? null)) {
        const until = new Date(Date.parse(adv!.currency_pref_set_at!) + LOCK_MS);
        return error(`currency is locked until ${until.toISOString().slice(0, 10)}`, 409);
      }

      // Lock the payment rail for 30 days. The rate stays live (no freeze) —
      // top-ups convert at the live rate, so the wallet's USD value is honest.
      const { error: upErr } = await db
        .from("advertisers")
        .update({ currency_pref: currency, currency_pref_set_at: new Date().toISOString(), fx_rate_locked: null })
        .eq("id", advertiserId);
      if (upErr) return error("could not set currency", 500);
      return json({ currency_pref: currency, fx_rate_locked: null, can_change_currency: false });
    }

    if (body.action === "delete") {
      const { error: delErr } = await db.from("advertisers").delete().eq("id", advertiserId);
      if (delErr) return error("could not delete account", 500);
      try {
        await db.auth.admin.deleteUser(authUserId);
      } catch {
        // Non-fatal: profile/data already removed; the empty auth user is harmless.
      }
      return json({ success: true });
    }

    return error("unknown action", 400);
  }

  return error("method not allowed", 405);
});
