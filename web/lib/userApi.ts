"use client";

// Developer-side web API: GitHub sign-in → CodeSlot session → balance + redeem.
// Reuses the SAME backend endpoints as the extension (/auth, /balance,
// /redeem-credits), so the web wallet shows identical data.
import { getUserSupabase, supabaseConfigured } from "./supabase";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"
).replace(/\/+$/, "");

const TOKEN_KEY = "codeslot.user.token";
const LOGIN_KEY = "codeslot.user.login";

export const CREDIT_USD = 0.001;
export const MIN_REDEEM_CREDITS = 5000;

export interface RecentEvent {
  advertiser_name: string;
  event_type: "impression" | "click";
  credits_awarded: number;
  created_at: string;
}
export interface Balance {
  balance: number;
  lifetime_earned: number;
  lifetime_redeemed: number;
  stats_today?: { impressions: number; clicks: number; earned: number };
  recent?: RecentEvent[];
}
export interface RedeemResult {
  success: boolean;
  new_balance: number;
  openrouter_credit_applied: number;
  openrouter_key?: string;
  openrouter_key_name?: string;
  estimated_tokens?: number;
  message?: string;
}

export function userToken(): string | null {
  return typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
}
export function userLogin(): string | null {
  return typeof localStorage !== "undefined" ? localStorage.getItem(LOGIN_KEY) : null;
}
export function userSignOut(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(LOGIN_KEY);
}

async function exchange(githubToken: string) {
  const res = await fetch(`${API_BASE}/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ github_token: githubToken }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || "Sign-in failed");
  }
  const j = (await res.json()) as { token: string; user: { login: string } };
  localStorage.setItem(TOKEN_KEY, j.token);
  localStorage.setItem(LOGIN_KEY, j.user.login);
  return j.user;
}

/** Production: GitHub via Supabase Auth → redirect back to /user. */
export async function signInWithGitHub(): Promise<void> {
  const sb = getUserSupabase();
  if (!sb) return;
  await sb.auth.signInWithOAuth({
    provider: "github",
    options: { scopes: "read:user user:email", redirectTo: `${window.location.origin}/user` },
  });
}

/** After the OAuth redirect, trade the GitHub provider token for our session. */
export async function completeGitHubLogin(): Promise<boolean> {
  if (!supabaseConfigured) return false;
  const sb = getUserSupabase();
  const { data } = (await sb?.auth.getSession()) ?? { data: { session: null } };
  const gh = data.session?.provider_token;
  if (!gh) return false;
  await exchange(gh);
  return true;
}

/** Local/dev sign-in against the mock backend. */
export async function devSignIn(token: string) {
  return exchange(token.trim() || "dev-user-token");
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = userToken();
  const res = await fetch(`${API_BASE}/${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(t ? { authorization: `Bearer ${t}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    let m = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      m = j.error ?? j.message ?? m;
    } catch {
      /* ignore */
    }
    const e = new Error(m) as Error & { status?: number };
    e.status = res.status;
    throw e;
  }
  return (await res.json()) as T;
}

export const getBalance = () => call<Balance>("balance");

export const redeem = (model: string, credits: number) =>
  call<RedeemResult>("redeem-credits", {
    method: "POST",
    body: JSON.stringify({
      model,
      credits_to_redeem: credits,
      idempotency_key: crypto.randomUUID(),
    }),
  });

export const REDEEM_MODELS = [
  { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5", vendor: "Anthropic" },
  { id: "openai/gpt-4o", name: "GPT-4o", vendor: "OpenAI" },
  { id: "google/gemini-1.5-pro", name: "Gemini 1.5 Pro", vendor: "Google" },
  { id: "meta-llama/llama-3.1-405b", name: "Llama 3.1 405B", vendor: "Meta" },
  { id: "deepseek/deepseek-v3", name: "DeepSeek V3", vendor: "DeepSeek" },
] as const;
