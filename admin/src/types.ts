export interface AdminUser {
  id: string;
  login: string;
  is_admin: boolean;
}

export interface Totals {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  users: number;
  payout_usd: number;
  margin_usd: number;
  // Owner / platform KPIs
  credits_earned: number;
  credits_redeemed: number;
  earned_usd: number;
  redeemed_usd: number;
  outstanding_usd: number;
  redemptions: number;
  total_campaigns: number;
  active_campaigns: number;
}

export interface Campaign {
  id: string;
  advertiser_name: string;
  text: string;
  active: boolean;
  status?: string;
  review_flag?: string | null;
  impressions: number;
  clicks: number;
  spend: number;
  budget_remaining: number;
}

export interface Treasury {
  collected_usd: number;
  openrouter_spent_usd: number;
  net_cash_usd: number;
  advertiser_float_usd: number;
  dev_liability_usd: number;
  distributable_usd: number;
}

export interface Metrics {
  totals: Totals;
  treasury?: Treasury;
  ad_serving_enabled: boolean;
  flagged_campaigns?: number;
  campaigns: Campaign[];
}

export interface NewAd {
  advertiser_name: string;
  text: string;
  url: string;
  description?: string;
  brand_color?: string;
  logo_url?: string;
  weight?: number;
  budget_remaining?: number;
  cost_per_impression?: number;
  cost_per_click?: number;
}
