// Unit economics shared by the Edge Functions (mirror of src/economics.ts).
// Credits are the accounting unit; 1 credit = $0.001.

export const CREDIT_USD = 0.001;
export const MIN_REDEEM_CREDITS = 5_000; // ~$5 minimum redemption
export const MAX_REDEEM_CREDITS = 10_000_000; // hard ceiling (defense in depth)
export const PLATFORM_FEE_RATE = 0.05;

export function creditsToUsd(credits: number): number {
  return Math.round(credits * CREDIT_USD * 100) / 100;
}
