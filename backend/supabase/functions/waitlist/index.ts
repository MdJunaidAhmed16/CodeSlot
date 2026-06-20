// POST /waitlist - public. Captures a developer email for the pre-launch
// waitlist. Inserted via the service role (RLS stays deny-all); idempotent on
// email so re-submitting is a no-op success.
import { error, handleOptions, json, readJson } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return error("method not allowed", 405);

  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
  } catch (e) {
    return error(e instanceof Error ? e.message : "bad request", 400);
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (email.length === 0 || email.length > 254 || !EMAIL_RE.test(email)) {
    return error("a valid email is required", 400);
  }
  const source = typeof body.source === "string" ? body.source.slice(0, 60) : null;

  const db = serviceClient();
  const { error: e } = await db
    .from("waitlist")
    .upsert({ email, source }, { onConflict: "email", ignoreDuplicates: true });
  if (e) return error("could not join the waitlist", 500);

  return json({ success: true });
});
