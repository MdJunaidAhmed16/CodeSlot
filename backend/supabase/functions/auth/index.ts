// POST /auth   Body: { github_token }
//
// Exchanges a GitHub access token (obtained by the extension via VS Code's
// native GitHub auth provider) for a CodeSlot session token. We verify the
// token by calling the GitHub API, then upsert the user keyed by GitHub id and
// issue our own signed JWT. The GitHub token is used once and never stored.
import { error, handleOptions, json, readJson } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { issueToken } from "../_shared/auth.ts";
import { FREE_SLOTS, USD_PER_SLOT } from "../_shared/capacity.ts";

// Cheap anti-sybil filter: reject brand-new GitHub accounts.
const MIN_ACCOUNT_AGE_DAYS = 7;

/**
 * The product owner(s). Configure via Edge Function secrets:
 *   OWNER_GITHUB_LOGINS="yourhandle"      (comma-separated, case-insensitive)
 *   OWNER_GITHUB_IDS="1234567"            (comma-separated; immutable, preferred)
 * A match grants owner + admin automatically on sign-in. IDs are recommended
 * because GitHub logins can be renamed and reused.
 */
function isOwnerAccount(githubId: number, login: string): boolean {
  const logins = (Deno.env.get("OWNER_GITHUB_LOGINS") ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const ids = (Deno.env.get("OWNER_GITHUB_IDS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    logins.includes(login.toLowerCase()) || ids.includes(String(githubId))
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return error("method not allowed", 405);

  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
  } catch (e) {
    return error(e instanceof Error ? e.message : "bad request", 400);
  }

  const ghToken = body.github_token;
  if (typeof ghToken !== "string" || ghToken.length < 8 || ghToken.length > 500) {
    return error("invalid github_token", 400);
  }

  // Verify with GitHub and read the account.
  let gh: { id?: number; login?: string; created_at?: string };
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        authorization: `Bearer ${ghToken}`,
        accept: "application/vnd.github+json",
        "user-agent": "CodeSlot",
      },
    });
    if (!res.ok) {
      return error("GitHub token rejected", 401);
    }
    gh = await res.json();
  } catch {
    return error("could not verify GitHub identity", 502);
  }

  if (typeof gh.id !== "number" || !gh.login) {
    return error("unexpected GitHub response", 502);
  }

  // Anti-sybil: account must be at least a few days old.
  if (gh.created_at) {
    const ageDays = (Date.now() - Date.parse(gh.created_at)) / 86_400_000;
    if (ageDays < MIN_ACCOUNT_AGE_DAYS) {
      return error(
        `GitHub account must be at least ${MIN_ACCOUNT_AGE_DAYS} days old to earn credits`,
        403
      );
    }
  }

  const owner = isOwnerAccount(gh.id, gh.login);

  const db = serviceClient();
  // Capacity-gated admission: new devs are only admitted while we have funding
  // (free slots + advertiser budget) to cover them; otherwise they're waitlisted.
  const { data, error: dbErr } = await db.rpc("admit_user", {
    p_github_id: gh.id,
    p_login: gh.login,
    p_owner: owner,
    p_free_slots: FREE_SLOTS,
    p_usd_per_slot: USD_PER_SLOT,
  });
  if (dbErr) {
    return error("could not create session", 500);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (row?.banned) {
    return error("account suspended", 403);
  }

  // Waitlisted: no earning token is issued. The extension shows a waitlist
  // panel and re-checks on its next sign-in (auto-promoted when a slot opens).
  if (row?.status === "waitlisted") {
    return json({
      status: "waitlisted",
      position: Number(row.wait_position) || 0,
      user: { login: gh.login },
    });
  }

  const userId = String(row.id);
  const isOwner = Boolean(row.is_owner);
  const isAdmin = Boolean(row.is_admin);
  const token = await issueToken({
    sub: userId,
    gh: gh.id,
    login: gh.login,
    own: isOwner,
    adm: isAdmin,
  });

  const { data: bal } = await db.rpc("current_balance", { p_user: userId });

  return json({
    status: "active",
    token,
    user: {
      id: userId,
      login: gh.login,
      is_owner: isOwner,
      is_admin: isAdmin,
      balance: Number(bal) || 0,
    },
  });
});
