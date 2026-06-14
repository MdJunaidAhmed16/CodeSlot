# CodeSlot — Roadmap & Phases

## Phase 0 — Validation (Pre-build, 1–2 days)
- [ ] Verify OpenRouter has an API/mechanism for crediting a user's account programmatically (blocking dependency for core redemption loop)
- [ ] Review VS Code Marketplace policies re: extensions displaying advertising content
- [ ] Confirm UI mockups (Google Stitch) align with status bar constraints (limited space, text truncation, VS Code theming)

**Exit criteria**: redemption mechanism confirmed feasible (or fallback chosen), no marketplace policy blocker identified

---

## Phase 1 — Infrastructure Setup (Days 1–3)
- [ ] Create Supabase project, set up Postgres schema (`ads`, `users`, `impressions`, `credit_ledger`, `redemptions`) with RLS enabled
- [ ] Set up Upstash Redis instance (rotation queue, rate-limit keys, frequency cap keys)
- [ ] Deploy Edge Functions: `/serve-ad`, `/track-event`, `/balance` (stub `/redeem-credits` initially)
- [ ] Seed `ads` table with 3–5 test ads

**Exit criteria**: Edge Functions deployed and testable via curl/Postman, returning correct ad rotation and logging events

---

## Phase 2 — Extension Core (Days 4–7)
- [ ] Scaffold VS Code extension (TypeScript, `yo code` or manual setup)
- [ ] Implement `deviceIdentity.ts` (UUID generation/persistence)
- [ ] Implement `statusBarAd.ts` (render ad text, click → open URL)
- [ ] Implement `adFetcher.ts` (poll `/serve-ad`, cache result, handle errors gracefully — never show broken UI if API down)
- [ ] Implement `impressionTracker.ts` (5s dwell timer based on window focus + status bar visibility)
- [ ] Wire up `/track-event` calls for impression and click

**Exit criteria**: extension runs locally in VS Code dev host, displays rotating ads, logs impressions/clicks to Supabase (verifiable via DB queries)

---

## Phase 3 — Credits & Balance (Days 8–9)
- [ ] Implement `/balance` integration — show balance in status bar tooltip
- [ ] Add command: "CodeSlot: Show Balance"
- [ ] Add command: "CodeSlot: Pause/Resume Ads" (opt-out, with clear messaging that pausing stops credit accrual)
- [ ] Add command: "CodeSlot: Delete My Data" (privacy compliance — calls a deletion endpoint)

**Exit criteria**: balance accurately reflects ledger sum, opt-out and deletion commands functional

---

## Phase 4 — Redemption Flow (Days 10–12)
- [ ] Implement `/redeem-credits` Edge Function based on Phase 0 findings
- [ ] Build webview UI for redemption (input OpenRouter account ref, confirm amount, show result)
- [ ] Handle edge cases: insufficient balance, OpenRouter API failures, idempotency
- [ ] If OpenRouter direct-credit API unavailable: implement fallback (e.g., generate redemption code, manual fulfillment process documented for early users)

**Exit criteria**: end-to-end redemption tested with real or test OpenRouter account

---

## Phase 5 — Polish & Privacy (Days 13–14)
- [ ] Apply UI mockups (Google Stitch designs) to status bar item styling/tooltip, webview redemption flow
- [ ] Write README with privacy commitment statement (from SECURITY.md)
- [ ] Add basic telemetry opt-out respecting VS Code's global telemetry settings
- [ ] Internal QA: test on fresh VS Code install, verify no workspace data ever leaves the machine (network inspection)

**Exit criteria**: extension feels polished, privacy claims verified via manual network audit

---

## Phase 6 — Private Beta (Weeks 3–4)
- [ ] Package extension (`.vsix`), distribute to 50–100 testers directly (not yet on Marketplace)
- [ ] Collect feedback on ad frequency, credit rates, UI placement
- [ ] Monitor for abuse patterns (anomalous device_ids, impression spam) via Supabase dashboard
- [ ] Iterate on credit rates based on real advertiser budget burn vs. engagement

**Exit criteria**: stable for 1+ week with real users, no critical bugs, credit economics roughly sustainable

---

## Phase 7 — Public Launch (Weeks 5–8)
- [ ] Submit to VS Code Marketplace
- [ ] Build-in-public launch content (X/LinkedIn) — frame against Kickbacks.ai comparison
- [ ] Outreach to potential paying advertisers (AI/dev-tool companies)
- [ ] Set up basic analytics dashboard (Supabase Studio or lightweight custom view) for advertiser reporting

**Exit criteria**: live on Marketplace, first paying advertiser secured

---

## Phase 8 — Expansion (Months 2–4)
- [ ] Add idle-panel ad surface
- [ ] Add sidebar widget surface
- [ ] Implement weighted ad rotation based on advertiser budgets (move logic fully to Redis)
- [ ] Explore language/framework-based targeting (using installed extensions as signal — privacy-reviewed)
- [ ] Evaluate cash payout option (Stripe Connect) as alternative to OpenRouter credits
- [ ] Basic advertiser self-serve portal (campaign creation, budget management)

**Exit criteria**: multi-surface inventory live, advertiser self-serve reduces manual ops load
