"use client";

// The wallet & billing are denominated in USD (base currency). An advertiser
// picks a billing currency (USD/INR) which is LOCKED for 30 days, and the
// USD→INR rate is FROZEN at selection time (stored server-side) — so the
// displayed balance never drifts and conversions stay consistent. These are
// pure helpers; the current currency + frozen rate are owned by the portal
// (sourced from the server) and passed in.
export type Currency = "usd" | "inr";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"
).replace(/\/+$/, "");

export const symbol = (c: Currency) => (c === "inr" ? "₹" : "$");
export const fromUsd = (usd: number, c: Currency, rate: number) => (c === "inr" ? usd * rate : usd);
export const toUsd = (amt: number, c: Currency, rate: number) => (c === "inr" ? amt / rate : amt);

export function fmt(usd: number, c: Currency, rate: number): string {
  const v = fromUsd(usd, c, rate);
  return c === "inr"
    ? "₹" + Math.round(v).toLocaleString("en-IN")
    : "$" + v.toFixed(2);
}

/** Today's USD→INR (live) — used only as a preview before a rate is locked. */
export async function fetchLiveRate(): Promise<number> {
  try {
    const r = await fetch(`${API_BASE}/fx-rate`);
    if (r.ok) {
      const j = await r.json();
      const v = Number(j?.usd_inr);
      if (v > 0) return v;
    }
  } catch {
    /* fallback */
  }
  return 83;
}
