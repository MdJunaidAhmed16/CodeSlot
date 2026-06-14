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

/** Whole credits with thousands separators, e.g. "12,340 cr". */
export function formatCredits(credits: number): string {
  return Math.round(credits).toLocaleString("en-US") + " cr";
}
