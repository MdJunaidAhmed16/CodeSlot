# CodeSlot — Business Strategy

## 1. Market Validation

Kickbacks.ai has already proven the core thesis: developers will accept ads embedded in their tools (Claude Code's "thinking" spinner text) in exchange for revenue share (~50%, ~$40.45/mo install cost reported). This validates:

- Willingness of devs to monetize idle/passive editor attention
- Willingness of advertisers (likely AI/dev-tool companies) to pay for this placement
- A single, simple ad slot is enough to generate meaningful revenue

CodeSlot differentiates via:
- **Multi-surface roadmap** (status bar → idle panel → sidebar → completions) — larger inventory over time
- **Token-based reward** (OpenRouter credits) instead of cash — stickier for the target audience (developers who already spend money on AI APIs), and avoids payment-processing overhead in v1
- **Privacy-first positioning** — explicit "we never read your code" guarantee, which Kickbacks' model (injecting into Claude Code's CLI output) may not emphasize as clearly

## 2. Target Users

### Developer side (supply)
- Individual developers, especially those using AI coding assistants heavily (high OpenRouter/API spend — credits have real value to them)
- Indie hackers, students, OSS contributors — price-sensitive, motivated by free AI tokens
- Estimated TAM: VS Code has tens of millions of active users; realistic SAM for an ad-tolerant niche (similar to ad-supported browser extensions) is in the hundreds of thousands

### Advertiser side (demand)
- AI coding tool companies (Cursor, Codeium, Continue, Tabnine, etc.) — want developer mindshare
- Dev infrastructure/SaaS (hosting, observability, CI/CD tools) — want technical audience
- AI model providers / API resellers — natural fit given the token-reward mechanic
- Early advertisers likely acquired via direct outreach / cold pitches rather than self-serve, given v1 has no dashboard

## 3. Revenue Model

| Stream | Description | Phase |
|---|---|---|
| CPM (cost per impression) | Advertiser pays per 1,000 impressions shown | v1 |
| CPC (cost per click) | Advertiser pays per click-through | v1 |
| Sponsored placements / flat fee | Fixed weekly/monthly fee for guaranteed rotation share | v2 |
| Premium surfaces | Higher rates for sidebar/idle panel placements (less intrusive, higher engagement) | v2 |
| Self-serve ad platform | Advertisers self-manage campaigns, budgets, targeting | v3 |

**Take rate**: CodeSlot keeps a margin between what advertisers pay and what's distributed as developer credits (e.g., advertiser pays $0.01/impression, developer earns $0.005 in credit value, CodeSlot margin covers OpenRouter redemption cost + platform operation).

## 4. Go-to-Market

### Phase 1 — Private Beta (Weeks 1–4)
- Ship MVP to 50–100 developers via direct outreach (build-in-public audience on X/LinkedIn — `@junaid.builds`)
- Seed 3–5 ads: can start with self-referential ads (promote your own projects — DSA Dojo, Junnz, etc.) or barter deals with other indie devs/tools for cross-promotion
- Goal: validate impression/click rates, redemption flow, no marketplace policy issues

### Phase 2 — Public Launch (Weeks 5–8)
- Publish to VS Code Marketplace publicly
- Build-in-public content: "I built an extension that pays you in AI tokens for ads in your status bar" — leverage existing audience and the Kickbacks comparison as a hook
- Outreach to 5–10 AI/dev-tool companies for paid ad slots (cold email/LinkedIn, framing: "reach engaged developers for $X CPM")

### Phase 3 — Expansion (Months 2–4)
- Add additional ad surfaces (idle panel, sidebar)
- Introduce basic advertiser self-serve (budget setting, simple targeting by VS Code language extensions installed)
- Explore cash payout option (Stripe Connect) alongside OpenRouter credits

## 5. Competitive Positioning

| | Kickbacks.ai | CodeSlot |
|---|---|---|
| Surface | Claude Code CLI spinner text | VS Code status bar (expanding to more surfaces) |
| Reward | Cash revenue share | AI tokens (OpenRouter credits) |
| Install cost | ~$40.45/mo reported | Free (ad-supported, no install fee) |
| Targeting | None known | Roadmap: language/framework-based |
| Privacy framing | Unclear | Explicit no-code-access guarantee |

**Key risk**: Kickbacks (or others) could expand to VS Code status bar quickly — CodeSlot's moat needs to be the token-redemption mechanic and multi-surface inventory, plus speed of execution and community trust from build-in-public presence.

## 6. Cost Structure (v1)

- Supabase: free tier likely sufficient at MVP scale (Edge Functions + Postgres)
- Upstash Redis: free tier (10K commands/day) likely sufficient initially
- Domain + minimal marketing: negligible
- No payout liability until redemption flow is live — credits are a liability on the books but no cash outflow until OpenRouter integration ships

## 7. Risks

- **OpenRouter integration uncertainty**: if no API exists for crediting accounts, redemption model needs a fallback (gift codes, manual process) — must validate early
- **VS Code Marketplace policy risk**: ad-displaying extensions may violate guidelines or get flagged — review before public launch
- **Advertiser supply risk**: v1 has no self-serve, so advertiser acquisition is manual/relationship-driven — may bottleneck revenue early
- **Fraud/credit farming**: client-reported impressions are gameable; keep per-event credit values low until server-side validation improves
- **Shariah compliance consideration** (personal note): ad-revenue models are generally permissible, but if advertiser categories ever include interest-based financial products, gambling, or similarly impermissible categories, an advertiser allowlist/blocklist by category should be considered for personal alignment

## 8. Milestones & KPIs

| Milestone | Target | Timeframe |
|---|---|---|
| MVP shipped (private beta) | 50+ active installs | Week 4 |
| First paid advertiser | 1 paying advertiser, $50+ spend | Week 8 |
| Public marketplace launch | 500+ installs | Week 10 |
| Redemption flow live | 20%+ of active users redeem at least once | Week 12 |
| Break-even on infra costs | Ad revenue ≥ Supabase/Upstash costs (likely $0 anyway at free tier) | Month 3 |
