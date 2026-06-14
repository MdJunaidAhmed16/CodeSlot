// Advertiser auth guard. Advertisers sign in with Supabase Auth (Google /
// GitHub) in the Next.js portal; their requests carry the Supabase access
// token. We verify it server-side via the service client and resolve (or
// create) the advertiser profile keyed by the Supabase auth user id.
import { error } from "./http.ts";
import { serviceClient } from "./supabase.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface AdvertiserContext {
  advertiserId: string;
  authUserId: string;
  email?: string;
  provider?: string;
  db: SupabaseClient;
}

export async function requireAdvertiser(
  req: Request
): Promise<AdvertiserContext | Response> {
  const header = req.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return error("authentication required", 401);

  const db = serviceClient();

  // Validate the Supabase access token and read the auth user.
  const { data, error: authErr } = await db.auth.getUser(m[1]);
  if (authErr || !data?.user) return error("invalid session", 401);
  const user = data.user;

  const provider =
    (user.app_metadata?.provider as string | undefined) ?? "unknown";
  const name =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email ??
    "Advertiser";

  // Upsert the advertiser profile.
  const { data: adv, error: upErr } = await db
    .from("advertisers")
    .upsert(
      {
        auth_user_id: user.id,
        email: user.email,
        name,
        provider,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "auth_user_id" }
    )
    .select("id, banned")
    .single();

  if (upErr || !adv) return error("could not load advertiser", 500);
  if (adv.banned) return error("account suspended", 403);

  return { advertiserId: adv.id, authUserId: user.id, email: user.email, provider, db };
}
