import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { exchangeGithubToken, setToken } from "./api";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON);

let client: SupabaseClient | null = null;
function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL!, SUPABASE_ANON!);
  }
  return client;
}

/**
 * Production sign-in: GitHub via Supabase Auth. supabase-js handles the OAuth
 * redirect and token exchange; we then trade the GitHub provider token for a
 * CodeSlot session token at /auth.
 */
export async function signInWithGitHub(): Promise<void> {
  await supabase().auth.signInWithOAuth({
    provider: "github",
    options: { scopes: "read:user", redirectTo: window.location.origin },
  });
}

/**
 * After the OAuth redirect, exchange the GitHub provider token for a CodeSlot
 * session. Returns true if a session was established.
 */
export async function completeSupabaseLogin(): Promise<boolean> {
  if (!supabaseConfigured) return false;
  const { data } = await supabase().auth.getSession();
  const ghToken = data.session?.provider_token;
  if (!ghToken) return false;
  await exchangeGithubToken(ghToken);
  return true;
}

/** Dev/mock sign-in: exchange a pasted/placeholder GitHub token directly. */
export async function signInDev(githubToken: string) {
  return exchangeGithubToken(githubToken.trim() || "dev-local-token");
}

export async function signOut(): Promise<void> {
  setToken(null);
  if (supabaseConfigured) {
    try {
      await supabase().auth.signOut();
    } catch {
      /* ignore */
    }
  }
}
