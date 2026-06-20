// Service-role Supabase client factory. The privileged key bypasses RLS and
// must NEVER be shipped to the client - it lives only in Edge Function env.
//
// Key compatibility: Supabase auto-injects the legacy SUPABASE_SERVICE_ROLE_KEY
// into Edge Functions. Projects on the new API-key system can instead set a
// SUPABASE_SECRET_KEY (sb_secret_...) - we accept either, preferring whatever
// is present. (The client apps use the publishable key; never the secret one.)
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEY");
  if (!url || !key) {
    throw new Error(
      "Supabase env not configured (need SUPABASE_URL + service role / secret key)"
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
