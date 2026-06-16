"use client";

// The wallet & billing are denominated in USD (the unit ads are priced in).
// USD is what we display — it never drifts. An advertiser picks a billing
// currency (USD/INR) which is the PAYMENT RAIL, locked for 30 days so checkout
// stays consistent. INR top-ups convert at the LIVE rate at the moment of
// payment (the real-money moment), so the platform carries no FX risk and the
// credited USD always matches the rupees actually received. For INR advertisers
// we show a clearly-live "≈ ₹X" hint next to the USD figure. These are pure
// helpers; the live rate is owned by the portal and passed in.
export type Currency = "usd" | "inr";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"
).replace(/\/+$/, "");

export const symbol = (c: Currency) => (c === "inr" ? "₹" : "$");
export const fromUsd = (usd: number, c: Currency, rate: number) => (c === "inr" ? usd * rate : usd);
export const toUsd = (amt: number, c: Currency, rate: number) => (c === "inr" ? amt / rate : amt);

/** Format an amount held in USD, in the given currency. */
export function fmt(usd: number, c: Currency, rate: number): string {
  const v = fromUsd(usd, c, rate);
  return c === "inr"
    ? "₹" + Math.round(v).toLocaleString("en-IN")
    : "$" + v.toFixed(2);
}

/** A clearly-live secondary hint, e.g. "≈ ₹4,150" — only shown to INR rails. */
export const inrHint = (usd: number, rate: number) =>
  "≈ ₹" + Math.round(usd * rate).toLocaleString("en-IN");

/** Today's live USD→INR rate (from the backend, which charges at the same rate). */
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
  return 90;
}
