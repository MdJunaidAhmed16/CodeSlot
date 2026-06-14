"use client";

import { getSupabase, supabaseConfigured } from "./supabase";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"
).replace(/\/+$/, "");

const DEV_TOKEN_KEY = "codeslot.adv.devtoken";
const DEV_EMAIL_KEY = "codeslot.adv.email";

export interface Campaign {
  id: string;
  advertiser_name: string;
  text: string;
  url: string;
  description?: string;
  brand_color?: string | null;
  logo_url?: string | null;
  status: "approved" | "rejected" | "pending" | "paused";
  moderation_reason?: string | null;
  active: boolean;
  budget_remaining: number;
  impressions?: number;
  clicks?: number;
  spend?: number;
}

export interface SubmitInput {
  advertiser_name: string;
  text: string;
  url: string;
  description?: string;
  brand_color?: string;
  logo_url?: string;
  budget_remaining?: number;
}

/** Returns the access token used to call advertiser endpoints. */
async function accessToken(): Promise<string | null> {
  if (supabaseConfigured) {
    const sb = getSupabase();
    const { data } = (await sb?.auth.getSession()) ?? { data: { session: null } };
    return data.session?.access_token ?? null;
  }
  return typeof localStorage !== "undefined" ? localStorage.getItem(DEV_TOKEN_KEY) : null;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`${API_BASE}/${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j.error ?? j.message ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

/** Local/dev sign-in (mock backend) — exchanges an email for a session token. */
export async function devSignIn(email: string): Promise<void> {
  const res = await fetch(`${API_BASE}/advertiser-auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error("Dev sign-in failed");
  const j = (await res.json()) as { token: string };
  localStorage.setItem(DEV_TOKEN_KEY, j.token);
  localStorage.setItem(DEV_EMAIL_KEY, email);
}

export function devEmail(): string | null {
  return typeof localStorage !== "undefined" ? localStorage.getItem(DEV_EMAIL_KEY) : null;
}

export function devSignOut(): void {
  localStorage.removeItem(DEV_TOKEN_KEY);
  localStorage.removeItem(DEV_EMAIL_KEY);
}

export async function isSignedIn(): Promise<boolean> {
  return (await accessToken()) !== null;
}

export interface Payment {
  provider: string;
  currency: string;
  amount_minor: number;
  amount_usd: number;
  status: string;
  created_at: string;
}

export interface PortalData {
  campaigns: Campaign[];
  wallet_usd: number;
  email: string | null;
  payments: Payment[];
}

export const listCampaigns = () => call<PortalData>("advertiser-campaigns");

export const submitCampaign = (input: SubmitInput) =>
  call<{ campaign: Campaign; approved: boolean; reason: string | null }>(
    "advertiser-campaigns",
    { method: "POST", body: JSON.stringify(input) }
  );

export type Currency = "usd" | "inr";

export interface PaymentCreateResult {
  provider: "stripe" | "razorpay" | "mock";
  checkout_url?: string;
  order_id?: string;
  key_id?: string;
  amount_minor?: number;
  currency?: string;
  amount_usd?: number;
  wallet_usd?: number;
  credited?: boolean;
}

/** Detect a default top-up currency from the browser (no network call). */
export function guessCurrency(): Currency {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    const lang = typeof navigator !== "undefined" ? navigator.language : "";
    if (tz === "Asia/Kolkata" || /(-IN)$/i.test(lang)) return "inr";
  } catch {
    /* ignore */
  }
  return "usd";
}

export const createPayment = (amount: number, currency: Currency) =>
  call<PaymentCreateResult>("payment-create", {
    method: "POST",
    body: JSON.stringify({ amount, currency, country: currency === "inr" ? "IN" : "US" }),
  });

export interface Account {
  email: string | null;
  name: string | null;
  provider: string | null;
  wallet_usd: number;
  campaigns: number;
  created_at: string | null;
}

export const getAccount = () => call<Account>("advertiser-account");

export const deleteAccount = () =>
  call<{ success: boolean }>("advertiser-account", {
    method: "POST",
    body: JSON.stringify({ action: "delete" }),
  });
