"use client";

import { useSyncExternalStore } from "react";

// The wallet & billing are denominated in USD (base currency). This is a
// per-advertiser DISPLAY + payment preference: amounts are shown in the chosen
// currency and Add Funds pays in it (USD→Stripe, INR→Razorpay). The USD→INR
// rate is today's live rate, fetched from our /fx-rate endpoint (same source
// the backend charges at) with a fallback until it loads.
export type Currency = "usd" | "inr";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787"
).replace(/\/+$/, "");

const KEY = "codeslot.currency";
const listeners = new Set<() => void>();
let rate = 83; // fallback until the live rate loads
let fetched = false;

function notify() {
  listeners.forEach((l) => l());
}

export function getCurrency(): Currency {
  if (typeof localStorage === "undefined") return "usd";
  const v = localStorage.getItem(KEY);
  return v === "inr" || v === "usd" ? v : "usd";
}
export function setCurrency(c: Currency): void {
  try {
    localStorage.setItem(KEY, c);
  } catch {
    /* ignore */
  }
  notify();
}
function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export const getRate = () => rate;

/** Fetch today's USD→INR once per session; re-render consumers when it lands. */
export function ensureFxRate(): void {
  if (fetched || typeof window === "undefined") return;
  fetched = true;
  fetch(`${API_BASE}/fx-rate`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const r = Number(j?.usd_inr);
      if (Number.isFinite(r) && r > 0) {
        rate = r;
        notify();
      }
    })
    .catch(() => {
      /* keep fallback */
    });
}

/** Reactive currency preference — re-renders consumers on currency or rate change. */
export function useCurrency(): [Currency, (c: Currency) => void] {
  const c = useSyncExternalStore(subscribe, getCurrency, getCurrency);
  return [c, setCurrency];
}

export const symbol = (c: Currency) => (c === "inr" ? "₹" : "$");
export const fromUsd = (usd: number, c: Currency) => (c === "inr" ? usd * rate : usd);
export const toUsd = (amt: number, c: Currency) => (c === "inr" ? amt / rate : amt);

/** Format a USD amount in the chosen currency at today's rate. */
export function fmt(usd: number, c: Currency): string {
  const v = fromUsd(usd, c);
  return c === "inr"
    ? "₹" + Math.round(v).toLocaleString("en-IN")
    : "$" + v.toFixed(2);
}
