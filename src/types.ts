/**
 * Shared types for the CodeSlot extension and its backend API.
 *
 * Privacy note: none of these payloads carry workspace data. The only
 * client-originated identifier is an anonymous device UUID.
 */

export type EventType = "impression" | "click";

/** Ad payload returned by GET /serve-ad. */
export interface Ad {
  ad_id: string;
  advertiser_name: string;
  text: string;
  /** Click-through URL. Always validated to be http(s) before it is opened. */
  url: string;
  /** Optional one-line description shown in the tooltip / wallet card. */
  description?: string;
  /** Advertiser brand color as a hex string (e.g. "#0070f3"), applied to the
   *  slot text. Validated client-side before use. */
  brand_color?: string;
  /** Advertiser logo (https image URL) shown in the tooltip. */
  logo_url?: string;
  weight?: number;
}

/** Response from GET /serve-ad. `ad` is null when serving is paused/empty. */
export interface ServeAdResponse {
  ad: Ad | null;
  /** Seconds the client should wait before requesting the next ad. */
  next_in_seconds?: number;
}

/** Response from POST /track-event. */
export interface TrackEventResponse {
  success: boolean;
  credits_earned: number;
  new_balance: number;
}

/** Response from GET /balance. */
export interface BalanceResponse {
  balance: number;
  lifetime_earned: number;
  lifetime_redeemed: number;
  /** Lightweight recent activity for the wallet view (no workspace data). */
  recent?: RecentEvent[];
  stats_today?: { impressions: number; clicks: number; earned: number };
}

export interface RecentEvent {
  advertiser_name: string;
  event_type: EventType;
  credits_awarded: number;
  created_at: string;
}

/** A model in the redeem picker (from GET /redeem-models, live + price-aware). */
export interface RedeemModel {
  id: string;
  name: string;
  vendor: string;
  context?: number; // context window in tokens
  price_in?: number; // USD per 1M prompt tokens
  price_out?: number; // USD per 1M completion tokens
  freeTier?: boolean;
}

/** Response from POST /redeem-credits. */
export interface RedeemResponse {
  success: boolean;
  new_balance: number;
  openrouter_credit_applied: number;
  /** Freshly minted OpenRouter API key, loaded with the redeemed amount.
   *  Returned exactly once — the backend cannot retrieve it again. */
  openrouter_key?: string;
  /** Human-readable name given to the provisioned key (model + date). */
  openrouter_key_name?: string;
  estimated_tokens?: number;
  message?: string;
}
