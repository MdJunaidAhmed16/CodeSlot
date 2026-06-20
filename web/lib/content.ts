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
  {
    name: "Status Bar",
    price: "$6",
    unit: "CPM",
    blurb: "Your sponsored message in the VS Code status bar - seen while developers actively code.",
    features: ["1,000 impressions", "~0.5-1% CTR", "Brand color + logo", "Self-serve, auto-approved"],
    highlight: true,
    cta: { label: "Start a campaign", kind: "portal" },
  },
  {
    name: "Click (CPC)",
    price: "$0.30",
    unit: "per click",
    blurb: "Pay only when an engaged developer clicks through - impressions are free.",
    features: ["Pay per click (impressions free)", "Dev-audience traffic", "Real-time metrics", "Cancel anytime"],
    highlight: false,
    cta: { label: "Start a campaign", kind: "portal" },
  },
  {
    name: "Sponsored",
    price: "Custom",
    unit: "flat / mo",
    blurb: "Guaranteed rotation share and premium placements for sustained campaigns.",
    features: ["Guaranteed share of voice", "Priority placement", "Dedicated support", "Invoiced billing"],
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
