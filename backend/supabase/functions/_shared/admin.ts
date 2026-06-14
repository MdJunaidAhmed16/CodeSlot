// Admin guard: verifies the CodeSlot session token AND confirms the user is an
// admin in the database (the DB is authoritative, not the token's `adm` claim).
import { error } from "./http.ts";
import { verifyRequest } from "./auth.ts";
import { serviceClient } from "./supabase.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface AdminContext {
  userId: string;
  login?: string;
  isOwner: boolean;
  db: SupabaseClient;
}

async function resolve(
  req: Request,
  need: "admin" | "owner"
): Promise<AdminContext | Response> {
  const claims = await verifyRequest(req);
  if (!claims) return error("authentication required", 401);

  const db = serviceClient();
  const { data, error: dbErr } = await db
    .from("users")
    .select("is_admin, is_owner, banned, github_login")
    .eq("id", claims.sub)
    .maybeSingle();

  if (dbErr) return error("authorization check failed", 500);
  if (!data || data.banned) return error("access denied", 403);

  const ok = need === "owner" ? data.is_owner : data.is_admin;
  if (!ok) return error(`${need} access required`, 403);

  return {
    userId: claims.sub,
    login: data.github_login ?? undefined,
    isOwner: Boolean(data.is_owner),
    db,
  };
}

/** Require an admin (campaign manager). Owners are always admins. */
export function requireAdmin(req: Request): Promise<AdminContext | Response> {
  return resolve(req, "admin");
}

/** Require the product owner (platform/financial views, kill switch). */
export function requireOwner(req: Request): Promise<AdminContext | Response> {
  return resolve(req, "owner");
}
