// Shared marketing copy & numbers (kept in sync with docs/06-UNIT-ECONOMICS.md).

export type PlanCtaKind = "portal" | "contact";

export const PRICING: {
  name: string;
  price: string;
  unit: string;
  blurb: string;
  features: string[];
  highlight: boolean;
  cta: { label: string; kind: PlanCtaKind };
}[] = [
  // Prepaid budget packs, not subscriptions - the wallet is genuinely prepaid
  // and spends per verified event, so these are suggested starting amounts and
  // the portal still accepts any custom figure. Impression counts are the pack
  // divided by the $6 CPM rate ($0.006 / impression).
  {
    name: "Starter",
    price: "$25",
    unit: "prepaid budget",
    blurb: "Enough reach to see real numbers before committing anything larger.",
    features: [
      "~4,100 impressions at $6 CPM",
      "Brand color + logo in the slot",
      "Self-serve, auto-screened in seconds",
      "Unused budget refunds to your wallet",
    ],
    highlight: false,
    cta: { label: "Start a campaign", kind: "portal" },
  },
  {
    name: "Growth",
    price: "$75",
    unit: "prepaid budget",
    blurb: "A sustained presence in the rotation - the usual choice for a first real test.",
    features: [
      "12,500 impressions at $6 CPM",
      "Everything in Starter",
      "Daily impression / click / spend charts",
      "Pause, edit or top up at any time",
    ],
    highlight: true,
    cta: { label: "Start a campaign", kind: "portal" },
  },
  {
    name: "Scale",
    price: "$200+",
    unit: "prepaid budget",
    blurb: "For a continuous campaign across the whole developer base.",
    features: [
      "~33,000 impressions at $6 CPM",
      "Everything in Growth",
      "Multiple concurrent campaigns",
      "Direct support from the founder",
    ],
    highlight: false,
    cta: { label: "Contact sales", kind: "contact" },
  },
];

export const HOW_IT_WORKS = [
  {
    title: "Developers opt in",
    body: "Developers install the CodeSlot extension and sign in with GitHub. A single, unobtrusive sponsored slot appears in their status bar while they code.",
  },
  {
    title: "You launch a campaign",
    body: "Submit ad copy, a destination URL, brand color, logo, and a budget. Our backend auto-screens it for safety and brand-impersonation, then it goes live - no waiting on manual review.",
  },
  {
    title: "Developers earn, you reach them",
    body: "Every qualified impression and click pays the developer in AI usage credits (redeemable for OpenRouter tokens). You only pay for real, budget-backed events.",
  },
  {
    title: "Track everything",
    body: "See impressions, clicks, CTR, and spend live in your advertiser portal. Pause or top up any time.",
  },
];

export const MODEL_POINTS = [
  { stat: "1 credit = $0.001", label: "Transparent reward unit for developers" },
  { stat: "$6 CPM", label: "Launch rate - well below dev-newsletter benchmarks" },
  { stat: "GitHub-verified", label: "Every earning account is a real developer" },
  { stat: "Privacy-first", label: "We never read code, files, or projects" },
];
