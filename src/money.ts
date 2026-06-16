import * as vscode from "vscode";
import { ApiClient } from "./api/client";
import type { DisplayCurrency } from "./economics";

/**
 * Resolves how earnings are shown to the developer: which currency, and the
 * live USD→INR rate when that currency is INR. The currency comes from the
 * `codeslot.displayCurrency` setting (auto/usd/inr); "auto" infers INR for
 * Indian developers from the editor timezone. The rate is fetched from the
 * public /fx-rate endpoint (the same one the backend bills at) and cached.
 */

export interface Money {
  currency: DisplayCurrency;
  rate: number; // USD→INR; 1 for USD
}

export function displayCurrency(): DisplayCurrency {
  const pref = vscode.workspace
    .getConfiguration("codeslot")
    .get<string>("displayCurrency", "auto");
  if (pref === "usd" || pref === "inr") {
    return pref;
  }
  // auto: infer from the editor's timezone (India → INR).
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    if (tz === "Asia/Kolkata" || tz === "Asia/Calcutta") {
      return "inr";
    }
  } catch {
    /* fall through to USD */
  }
  return "usd";
}

let cached: { rate: number; at: number } | null = null;
const RATE_TTL_MS = 6 * 60 * 60 * 1000;

async function usdInrRate(api: ApiClient): Promise<number> {
  if (cached && Date.now() - cached.at < RATE_TTL_MS) {
    return cached.rate;
  }
  try {
    const { usd_inr } = await api.fxRate();
    if (Number.isFinite(usd_inr) && usd_inr > 0) {
      cached = { rate: usd_inr, at: Date.now() };
      return usd_inr;
    }
  } catch {
    /* use the fallback below */
  }
  return cached?.rate ?? 90;
}

export async function resolveMoney(api: ApiClient): Promise<Money> {
  const currency = displayCurrency();
  const rate = currency === "inr" ? await usdInrRate(api) : 1;
  return { currency, rate };
}
