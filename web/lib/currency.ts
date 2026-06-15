"use client";

import { useSyncExternalStore } from "react";

// The wallet & billing are denominated in USD (base currency). This is a
// per-advertiser DISPLAY + payment preference: amounts are shown in the chosen
// currency and Add Funds pays in it (USD→Stripe, INR→Razorpay). Conversion uses
// a fixed rate that mirrors the backend USD_INR_RATE.
export const USD_INR_RATE = 83;
export type Currency = "usd" | "inr";

const KEY = "codeslot.currency";
const listeners = new Set<() => void>();

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
  listeners.forEach((l) => l());
}
function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Reactive currency preference — re-renders all consumers when it changes. */
export function useCurrency(): [Currency, (c: Currency) => void] {
  // getCurrency doubles as the server snapshot (returns "usd" when there's no
  // localStorage), keeping the inferred type as Currency rather than string.
  const c = useSyncExternalStore(subscribe, getCurrency, getCurrency);
  return [c, setCurrency];
}

export const symbol = (c: Currency) => (c === "inr" ? "₹" : "$");
export const fromUsd = (usd: number, c: Currency) => (c === "inr" ? usd * USD_INR_RATE : usd);
export const toUsd = (amt: number, c: Currency) => (c === "inr" ? amt / USD_INR_RATE : amt);

/** Format a USD amount in the chosen currency. */
export function fmt(usd: number, c: Currency): string {
  const v = fromUsd(usd, c);
  return c === "inr"
    ? "₹" + Math.round(v).toLocaleString("en-IN")
    : "$" + v.toFixed(2);
}
