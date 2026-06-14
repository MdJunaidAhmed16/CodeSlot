// POST /delete-data   (requires Authorization: Bearer <session token>)
// GDPR-style hard delete of all data tied to the authenticated user.
// Cascades from `users` to impressions, ledger, and redemptions.
import { error, handleOptions, json } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { verifyRequest } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return error("method not allowed", 405);

  const claims = await verifyRequest(req);
  if (!claims) return error("authentication required", 401);

  const db = serviceClient();
  const { error: dbErr } = await db.rpc("delete_user", { p_user: claims.sub });
  if (dbErr) return error("deletion failed", 500);

  return json({ success: true });
});
