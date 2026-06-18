/**
 * Single source of truth for CodeSlot's unit economics (docs/06-UNIT-ECONOMICS.md).
 *
 * Credits are the internal accounting unit. Balances and ledger amounts are
 * always expressed in WHOLE credits; USD is derived for display and redemption.
 */

/** 1 credit = $0.001. */
export const CREDIT_USD = 0.001;

/** Minimum redemption: 5,000 credits (~$5), matching OpenRouter top-up minimum. */
export const MIN_REDEEM_CREDITS = 5_000;

/** Platform fee applied at redemption (on top of the earn-side margin). */
export const PLATFORM_FEE_RATE = 0.05;

/** Default per-event developer rewards, in credits (see §3). */
export const REWARD = {
  impression: 5, // ~$0.005 — ~45–50% pass-through of a $10 CPM
  click: 75, // ~$0.075 — pass-through of $0.15–0.30 CPC
} as const;

export function creditsToUsd(credits: number): number {
  return credits * CREDIT_USD;
}

export function usdToCredits(usd: number): number {
  return Math.round(usd / CREDIT_USD);
}

export function formatUsd(usd: number): string {
  return "$" + usd.toFixed(2);
}

/** The currency we surface earnings in. INR uses a live USD→INR rate. */
export type DisplayCurrency = "usd" | "inr";

/**
 * Format a USD amount as real money in the developer's display currency.
 * Earnings lead with money (this) so the value feels tangible; raw credits are
 * shown only as a small secondary note via {@link formatCredits}.
 *
 * Precision is adaptive: a single impression earns a fraction of a rupee/cent,
 * so amounts under one unit get extra decimals — otherwise tiny-but-real
 * earnings would collapse to "₹0" / "$0.00". Whole amounts stay clean.
 */
export function formatMoney(
  usd: number,
  currency: DisplayCurrency = "usd",
  rate = 1
): string {
  const val = currency === "inr" ? usd * rate : usd;
  if (currency === "inr") {
    if (val === 0) return "₹0";
    if (val >= 1) return "₹" + Math.round(val).toLocaleString("en-IN");
    const d = val >= 0.1 ? 2 : val >= 0.01 ? 3 : 4;
    return "₹" + val.toFixed(d);
  }
  if (val === 0) return "$0.00";
  if (val >= 0.01) return "$" + val.toFixed(2);
  return "$" + val.toFixed(val >= 0.001 ? 3 : 4);
}

/** Format whole credits as real money, e.g. 5_000 → "$5.00" / "₹474". */
export function creditsToMoney(
  credits: number,
  currency: DisplayCurrency = "usd",
  rate = 1
): string {
  return formatMoney(creditsToUsd(credits), currency, rate);
}

/** Whole credits with thousands separators, e.g. "12,340 cr". */
export function formatCredits(credits: number): string {
  return Math.round(credits).toLocaleString("en-US") + " cr";
}
