// Unit economics shared by the Edge Functions (mirror of src/economics.ts).
// Credits are the accounting unit; 1 credit = $0.001.

export const CREDIT_USD = 0.001;
export const MIN_REDEEM_CREDITS = 5_000; // ~$5 minimum redemption
export const MAX_REDEEM_CREDITS = 10_000_000; // hard ceiling (defense in depth)
export const PLATFORM_FEE_RATE = 0.05;

export function creditsToUsd(credits: number): number {
  return Math.round(credits * CREDIT_USD * 100) / 100;
}

// Launch rate card. A campaign is billed EITHER by impressions (CPM) OR by
// clicks (CPC) - never both. The developer is rewarded only on the billed
// event (so credits are always backed by advertiser revenue).
export type BillingModel = "cpm" | "cpc";

export const RATE_CARD = {
  // $6 CPM ($0.006/impression) - launch rate, kept low to attract early
  // advertisers. Developer reward is held at 4 credits ($0.004 = ~67%); the
  // platform keeps ~$0.002 (~33%). Raise the cost later as reach grows.
  cpm: { cost_per_impression: 0.006, reward_per_impression: 4 },
  // $0.30 CPC; developer earns 90 credits = $0.09 = 30%.
  cpc: { cost_per_click: 0.30, reward_per_click: 90 },
} as const;

/** Per-ad cost/reward columns for a given billing model (the unbilled side = 0). */
export function ratesFor(model: BillingModel) {
  if (model === "cpc") {
    return {
      cost_per_impression: 0,
      reward_per_impression: 0,
      cost_per_click: RATE_CARD.cpc.cost_per_click,
      reward_per_click: RATE_CARD.cpc.reward_per_click,
    };
  }
  return {
    cost_per_impression: RATE_CARD.cpm.cost_per_impression,
    reward_per_impression: RATE_CARD.cpm.reward_per_impression,
    cost_per_click: 0,
    reward_per_click: 0,
  };
}
