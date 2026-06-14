# CodeSlot — Product Requirements Document

## 1. Overview

CodeSlot is a VS Code extension that displays a single, unobtrusive ad slot in the status bar. Developers earn credits for impressions and clicks, which they redeem for AI usage credits via OpenRouter (giving access to Claude, GPT, Gemini, and other models). Advertisers (AI tooling companies, dev SaaS, infra providers) bid for placement targeted at developers actively coding.

## 2. Problem Statement

- Developers spend 6–10 hours/day in their editor — high-attention, high-frequency surface that is currently ad-free.
- Independent developers want free/cheap access to frontier LLM APIs but token costs add up quickly.
- Advertisers in the dev-tools/AI space struggle to reach engaged developers outside of generic ad networks (Twitter/X, Reddit) with poor targeting.
- A competitor (Kickbacks.ai) has validated demand for this exact wedge by monetizing the Claude Code CLI "thinking" spinner text — proving developers will accept ads in their tools if the payout is meaningful.

## 3. Goals (v1 / MVP)

- Ship a working VS Code extension with a single status bar ad slot within 2 weeks.
- Track impressions (5-second dwell) and clicks reliably.
- Convert accumulated credits into OpenRouter API credit top-ups.
- Onboard 3–5 seed advertisers (can be internal/test ads initially) and 50–100 beta developer users.

## 4. Non-Goals (v1)

- Multi-surface placements (sidebar, idle panel, inline completions) — deferred to v2.
- Real-time bidding / auction system — v1 uses a simple rotation/priority queue.
- Cash payouts (Stripe) — credits-to-tokens only for v1.
- Advertiser self-serve dashboard — manual ad upload via Supabase table for v1.
- Targeting by language/framework — deferred; v1 serves ads from a single rotating pool.

## 5. User Personas

### 5.1 Developer (Earner)
- Installs extension from VS Code Marketplace.
- Sees a small ad in the status bar (e.g., "Sponsored: Try Cursor's new agent mode →").
- Earns credits passively while coding; periodically redeems credits for OpenRouter top-ups.
- Cares about: non-intrusiveness, privacy (no code/content scanning), easy redemption.

### 5.2 Advertiser
- AI/dev tooling company wanting visibility with engaged developers.
- Submits ad copy + link + budget (manual process in v1).
- Cares about: impression/click metrics, cost per click, audience quality.

## 6. Core Features (v1)

| Feature | Description | Priority |
|---|---|---|
| Status bar ad display | Rotating ad text + link in VS Code status bar | P0 |
| Impression tracking | 5s dwell time counts as 1 impression | P0 |
| Click tracking | Click opens ad URL in browser, logs click | P0 |
| Anonymous device ID | UUID generated on install, used for credit ledger | P0 |
| Credit accrual | Impressions/clicks accrue credits per defined rates | P0 |
| Credit balance display | Hover/tooltip shows current balance | P1 |
| OpenRouter redemption | Convert credits to OpenRouter account credit | P0 |
| Ad rotation | Round-robin or weighted rotation across active ads | P0 |
| Frequency capping | Avoid showing same ad repeatedly in short span | P1 |
| Opt-out / pause | User can pause ads (forfeits new credit accrual) | P1 |

## 7. Success Metrics

- **Activation**: % of installs that remain active after 7 days
- **Engagement**: avg impressions/day per active user
- **Redemption rate**: % of users who redeem credits within 30 days
- **Advertiser retention**: repeat ad submissions from same advertiser
- **CTR**: clicks / impressions (benchmark against Kickbacks if data becomes public)

## 8. Constraints & Assumptions

- OpenRouter must support programmatic credit top-up to user accounts — **needs verification before committing to this redemption model** (fallback: gift codes / manual crediting if API unsupported).
- VS Code Marketplace policies must permit ad-displaying extensions — review marketplace guidelines before submission.
- All tracking must be privacy-respecting: no source code, file names, or project content ever leaves the user's machine.

## 9. Open Questions

- Does OpenRouter expose an API for crediting a user's account by their account ID/email? (Blocking for redemption flow — verify in Phase 2)
- What credit-to-token exchange rate is sustainable given ad revenue per impression?
- Will VS Code Marketplace flag/reject extensions with embedded advertising?
