# Changelog

## Unreleased — Auth, economics & admin

- **GitHub authentication** (required to earn). Sign-in via VS Code's native
  GitHub provider; the backend verifies the token and issues a signed session
  JWT. The credit ledger is keyed to the verified GitHub account, not a
  spoofable device id — closing the credit-farming hole.
- **Unit economics** implemented per docs/06: 1 credit = $0.001, 5 cr/impression,
  75 cr/click, 4-min rotation, $5 (5,000-credit) redemption minimum, 5% fee.
- **Redemption mints a real OpenRouter key** (Provisioning API) with a dollar
  limit, shown once with reveal/copy; auto-refund if minting fails.
- **Owner role** — the product owner is detected automatically from a GitHub
  allowlist (`OWNER_GITHUB_LOGINS` / `OWNER_GITHUB_IDS`). The platform dashboard
  and kill switch are owner-only; campaign creation is hidden for owners.
- **Standalone admin/owner dashboard** (Vite + React) — Platform overview
  (developers, campaigns running, credits earned/redeemed, outstanding liability,
  margin), ad performance, campaign management, kill switch.
- Brand color + logo support in the ad slot/tooltip.
- Secure deployment guide ([DEPLOYMENT.md](DEPLOYMENT.md)).

## 0.1.0 — Initial MVP

- Single sponsored slot in the status bar with a live credit readout.
- 5-second focused-dwell impression tracking (focus boolean only — no workspace access).
- Click-through tracking that opens the sponsor link and credits a click.
- Anonymous device UUID stored in `globalState`.
- Wallet webview: balance, today's earnings, recent activity, ad-preferences toggle.
- 3-step Redeem flow (select model → set amount → confirm) with OpenRouter.
- Commands: Open Wallet, Redeem Credits, Show Balance, Pause/Resume, Open Current Ad, Delete My Data.
- Strict, nonce-based CSP on all webviews; OpenRouter key kept in SecretStorage.
- Serverless backend (Supabase Edge Functions + Postgres + Upstash Redis) with
  deny-all RLS, atomic/idempotent crediting and redemption, rate limiting, and a kill switch.
