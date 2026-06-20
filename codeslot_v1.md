# CodeSlot - System Reference (v1)

> A single, complete reference for the entire CodeSlot system as it exists at
> v0.1.0 (pre-launch). Covers the product, business model, every component, the
> data model, the API surface, the key decisions and their rationale, security,
> the go-to-market plan, and the deployment state / open blockers.
>
> Status: code-complete, pre-launch. Repo: `github.com/MdJunaidAhmed16/CodeSlot`
> (private). Extension `codeslot@0.1.0`, publisher `junaidbuilds`, proprietary
> license. Backend deployed to Supabase; payments in Razorpay test mode.

---

## 1. What CodeSlot is

CodeSlot is a **developer ad network**. It shows **one** small, non-intrusive
sponsored slot in the VS Code status bar. Developers earn **AI usage credits**
while they code; those credits are redeemable for real AI tokens via
**OpenRouter** (Claude, GPT, Gemini, and more). Advertisers fund campaigns that
reach an engaged technical audience.

It is a **two-sided marketplace**:

- **Developers (earners / supply)** - install the extension, sign in with
  GitHub, and accrue credits on impressions and clicks. They are the inventory
  advertisers pay to reach.
- **Advertisers (demand)** - sign in to a web portal (Google/GitHub), fund a
  prepaid wallet (or pay per campaign), and launch auto-moderated campaigns.
- **Owner (you)** - a single product owner with a financial/ops dashboard and a
  kill switch.

Hard privacy line: the extension **never reads code, files, or project data**.
The only editor signal it uses is whether the window is focused (a boolean), to
time impressions. It sends one anonymous device id plus impression/click events.

---

## 2. The five components

| Component | Tech | Role |
|---|---|---|
| **Extension** (`src/`, `media/`) | TypeScript, esbuild, VS Code API | The status-bar slot, wallet/redeem webviews, GitHub sign-in, earning. |
| **Backend** (`backend/`) | Supabase Edge Functions (Deno) + Postgres + Upstash Redis | All logic, identity, ledger, moderation, payments, redemption. |
| **Marketing site + advertiser portal** (`web/`) | Next.js 16, React 19, Tailwind 3, shadcn/ui | Public site, advertiser auth + campaign portal, developer waitlist + web wallet. |
| **Owner/admin dashboard** (`admin/`) | Vite 7 + React 18 + shadcn | Owner-gated platform overview, campaign management, kill switch. |
| **Local mock server** (`dev/mock-server.js`) | Zero-dependency Node `http` | Mirrors the entire API in-memory for local dev/testing. |

Both `web/` and `admin/` deploy to **Vercel**; the backend to **Supabase**; the
extension to the **VS Code Marketplace**.

---

## 3. Business model and unit economics

**Accounting unit:** `1 credit = $0.001`. Balances and the ledger are always in
whole credits; money is derived for display and redemption.

### Launch rate card (`backend/supabase/functions/_shared/economics.ts`)

A campaign is billed by **CPM** (impressions) OR **CPC** (clicks), never both.
The developer is rewarded only on the billed event, so every credit is backed
by advertiser revenue.

| Model | Advertiser pays | Developer earns | Platform gross | Notes |
|---|---|---|---|---|
| **CPM** | $0.006 / impression (**$6 CPM**) | 4 credits = $0.004 (~67%) | ~$0.002 (~33%) | $6 launch rate, lowered from $10. |
| **CPC** | $0.30 / click | 90 credits = $0.09 (~30%) | ~$0.21 (~70%) | Unchanged; already cheap vs Google. |

- **$6 CPM is a deliberate launch rate** - low to attract early advertisers; the
  developer reward was intentionally held at 4 credits when CPM dropped, so devs
  now keep the majority. Easy to raise later as reach grows. (Lowering the cost
  only affects NEW campaigns; existing live campaigns keep their booked rate.)
- **Redemption:** minimum `5,000 credits` (~$5, matches OpenRouter top-up
  minimum); a **5% platform fee** is applied at redemption.
- **Net per CPM impression** ~ $0.0022 after OpenRouter redemption cost (dev
  redeems $0.004 of credits at 95% -> ~$0.0038 cash to OpenRouter), before
  Stripe/Razorpay fees (~2-3%) and FX. Positive but thin - intended for growth.
- **Minimum wallet top-up:** $5.

### Why no "welcome credit" giveaway
Free advertiser credit was rejected: a dev credit is a **real liability** (free
impressions still generate real dev credits that get redeemed for real
OpenRouter dollars), so the platform would eat 100% of that. Every credit must
be backed by advertiser payment.

---

## 4. Identity and authentication (three distinct roles)

| Role | Auth mechanism | Token the API sees |
|---|---|---|
| **Developer** (extension + web wallet) | GitHub - VS Code native auth provider (extension) or Supabase Auth GitHub (web). The `/auth` function verifies the GitHub token against GitHub, upserts a user keyed by **immutable GitHub id**, and mints a **CodeSlot HS256 JWT** (djwt). | CodeSlot session JWT (Bearer). |
| **Advertiser** (web portal) | Supabase Auth (Google / GitHub). | Supabase access token, verified server-side via `requireAdvertiser`. |
| **Owner** (admin dashboard) | GitHub via Supabase Auth; owner is auto-detected from the `OWNER_GITHUB_LOGINS` / `OWNER_GITHUB_IDS` env allowlist on first sign-in (sets `is_owner = is_admin = true`). | Same as developer; owner-gated endpoints re-check `is_owner` in the DB. |

- The credit ledger is keyed to the **verified GitHub account**, not a spoofable
  device id - this closes the credit-farming hole.
- **Web session isolation:** the advertiser portal and developer web wallet use
  **separate Supabase clients with separate storage keys**
  (`sb-codeslot-advertiser` vs `sb-codeslot-user`), so one person can be signed
  in as both at once and signing out of one does not clobber the other.

---

## 5. Data model (Postgres)

RLS is **deny-all** on every table (no anon/authenticated policies). Only Edge
Functions, using the **service role**, read/write. Schema in `backend/schema.sql`;
idempotent column/table sync in `backend/migrate.sql`.

### Tables (9)
- **`advertisers`** - Supabase-auth-keyed profile. `wallet_usd` (prepaid USD
  balance), `currency_pref` (`usd`/`inr`, the locked payment rail),
  `currency_pref_set_at`, `fx_rate_locked` (now always null - rate is live),
  `banned`.
- **`payments`** - one row per top-up attempt. `provider` (stripe/razorpay),
  `provider_ref` (order/session id, unique per provider), `currency`,
  `amount_minor`, `amount_usd`, `status` (created/paid/failed). Credited only by
  verified webhook or `/payment-verify`.
- **`ads`** (campaigns) - `advertiser_id`, `text`, `url`, `description`,
  `brand_color`, `logo_url`, `billing_model` (cpm/cpc), `status`
  (approved/rejected/pending/paused), `moderation_reason`, `review_flag` (soft
  warning), `weight`, `budget_remaining`, `cost_per_impression` (default 0.006),
  `cost_per_click`, `reward_per_impression` (default 4), `reward_per_click`,
  `active`.
- **`users`** - GitHub-keyed developers. `github_id` (unique), `github_login`,
  `is_owner`, `is_admin`, `banned`.
- **`impressions`** - append-only event log (impression/click) with
  `credits_awarded`, `idempotency_key`, `created_at`. Source for analytics.
- **`credit_ledger`** - append-only; balance = `sum(amount)`; reasons
  impression/click/redemption/adjustment.
- **`redemptions`** - credits -> OpenRouter key records (`model`,
  `openrouter_amount`, `openrouter_key_id` hash, `status`, idempotency).
- **`feature_flags`** - kill switch (`ad_serving_enabled`).
- **`waitlist`** - pre-launch developer email capture (`email` unique,
  `source`).

### Views / RPCs (SECURITY-relevant, atomic + idempotent)
- **View `ad_metrics`** - per-campaign lifetime impressions/clicks/spend
  (includes `advertiser_id`).
- **RPCs:** `current_balance`, `upsert_github_user`, `record_event` (credits an
  event; enforces budget + click-must-follow-impression), `redeem_credits`,
  `delete_user`, `confirm_payment` (idempotent wallet credit, used by webhook +
  verify), `add_wallet`, `spend_wallet`, `advertiser_daily_metrics` (zero-filled
  daily series for charts).

---

## 6. Backend - Edge Functions (19)

All have `verify_jwt = false` in `config.toml`; auth is enforced in-code.

**Developer (extension/web wallet):**
- `auth` - GitHub token -> CodeSlot JWT (verifies against GitHub, upserts user).
- `serve-ad` - GET next ad (anonymous, weighted, kill-switch aware; returns
  `{ad:null}` when none available -> extension shows the placeholder).
- `track-event` - POST impression/click -> credits (auth, atomic, idempotent,
  anti-fraud gates).
- `balance` - GET balance + today + recent activity (auth).
- `redeem-credits` - POST credits -> mints a real OpenRouter key via the
  Provisioning API (auth, atomic, idempotent, auto-refund on mint failure).
- `redeem-models` - GET public, price-aware OpenRouter model catalog (live from
  `/api/v1/models`, curated: chat-only, <=4 per vendor, cheapest-first, cached
  12h, static fallback).
- `delete-data` - POST hard-delete the developer's data (auth).

**Advertiser:**
- `advertiser-account` - GET profile (currency lock); POST `set_currency`
  (locks rail 30 days, rate stays live); POST `delete` (cascade + delete
  Supabase auth user).
- `advertiser-campaigns` - GET campaigns + wallet + lifetime metrics; POST
  create (auto-moderate -> fund from wallet or 402); PATCH edit/pause/top-up
  (re-moderates on content change); DELETE (refund remaining budget).
- `advertiser-analytics` - GET `?days=7|30|90` daily series + window totals.

**Payments:**
- `payment-create` - creates a Razorpay order / Stripe session; honors the
  locked currency rail; converts at the **live** rate (no freeze).
- `payment-verify` - verifies the Razorpay checkout signature and credits the
  wallet **synchronously** via `confirm_payment` (dodges the webhook race for
  pay-to-launch; webhook remains the backstop).
- `payment-webhook-razorpay` / `payment-webhook-stripe` - signature-verified
  async crediting via `confirm_payment`.

**Public utility:**
- `fx-rate` - GET live USD->INR rate (frankfurter/ECB, cached 6h).
- `waitlist` - POST developer email capture (validate + service-role insert,
  idempotent on email).

**Owner/admin:**
- `admin-metrics` - platform overview (developers, campaigns, credits
  earned/redeemed, outstanding liability, margin, OpenRouter spend).
- `admin-ads` - GET/POST/PATCH ad CRUD.
- `admin-flags` - POST kill switch.

Shared (`_shared/`): `http` (CORS, json/error, readJson), `supabase` (service
client), `advertiser` (auth guard), `auth`/admin guards, `economics`,
`moderation`, `payments` (signature verify), `fx`, rate limiter.

---

## 7. The VS Code extension

**Entry:** `src/extension.ts`. Bundled by esbuild to `dist/extension.js`
(~26 KB). Activation: `onStartupFinished`.

### Source files (`src/`)
`extension.ts` (wiring), `config.ts` (backend URL, marketing URL, settings),
`deviceIdentity.ts` (anonymous UUID in globalState), `api/client.ts` (typed
https client - only talks to the configured backend, times out, no file APIs),
`auth.ts` (GitHub native auth -> session token), `secrets.ts` (SecretStorage),
`adFetcher.ts` (polls serve-ad, validates, resilient), `impressionTracker.ts`
(5s focused-dwell impression + click reporting + anti-fraud), `statusBarAd.ts`
(the slot + balance readout + placeholder), `economics.ts` (credit math + money
formatting), `money.ts` (display currency + live rate resolver), `types.ts`,
`util/{validation,nonce}.ts`, `webview/{html,walletPanel,redeemPanel}.ts`.
Webview assets: `media/{wallet.js,wallet.css,redeem.js,redeem.css,icon.png}`.

### Commands (8 public + 1 internal)
`signIn`, `signOut`, `openWallet`, `redeemCredits`, `showBalance`,
`togglePause`, `openCurrentAd`, `deleteMyData`, and internal `advertise` (opens
the marketing site from the placeholder).

### Settings (3)
- `codeslot.enabled` (bool, default true).
- `codeslot.displayCurrency` (`auto`/`usd`/`inr`, default auto - `auto` infers
  INR for India from the editor timezone).
- `codeslot.apiBaseUrl` (advanced https override; http allowed only for
  localhost / the mock).

### Key behaviors
- **Earnings shown as real money** ($ or INR), with raw credits demoted to a
  tooltip/footnote. INR uses the live `/fx-rate` (cached 6h).
- **Adaptive precision:** tiny per-event earnings show extra decimals (e.g.
  +INR0.38, $0.004) so they never collapse to "INR0 / $0.00".
- **Never-empty slot:** when no paid campaign is available, the slot shows a
  **non-earning** "Advertise on CodeSlot" placeholder (opens the portal) instead
  of disappearing - so a new earner never sees an empty/$0 first impression.
- **Logo/brand color:** the brand color tints the slot **text** (VS Code does
  not allow arbitrary status-bar backgrounds - only error/warning theme
  colors); the logo shows in the hover tooltip.
- **Redeem flow:** pick model (live catalog) -> set amount -> confirm -> backend
  mints a fresh OpenRouter key loaded with the value, shown once with
  reveal/copy.
- Webviews use strict nonce-based CSP with `connect-src 'none'` - all data
  arrives via postMessage from the trusted host.

### Marketplace packaging
- `npm run vsix` -> `vsce package --allow-missing-repository` (~24 KB, 12 files:
  `dist/`, `media/`, README/CHANGELOG/LICENSE, package.json). `.vscodeignore`
  excludes the rest of the monorepo + internal docs.
- License is **proprietary** ("all rights reserved"); `repository`/`homepage`/
  `bugs` GitHub links removed (private repo).

---

## 8. Marketing site + advertiser portal (`web/`)

Next.js 16 (App Router) + React 19 + Tailwind 3 + shadcn/ui. Deploys to Vercel.

### Routes (`web/app/`)
- `/` - home (advertiser-facing pitch + a **developer waitlist** section).
- `/how-it-works`, `/pricing`, `/terms`, `/privacy`, `/refund`, `/contact`.
- `/login` - advertiser sign-in (Google / GitHub / email).
- `/portal` - advertiser dashboard: wallet, new campaign, analytics, campaign
  list (edit/pause/delete), profile menu (currency, delete account).
- `/user` - developer web wallet (balance, today, recent, redeem); `/user/login`
  - developer GitHub sign-in.

### Advertiser portal highlights
- **Wallet** held in **USD** (the true unit; never drifts). For INR advertisers
  a clearly-live "INR X today" hint sits next to the USD figure.
- **Currency:** the chosen currency is only a **payment rail**, locked 30 days.
  INR top-ups convert at the **live** rate at the moment of payment (no frozen
  rate), so the platform carries no FX risk and credited USD matches rupees
  received.
- **Pay-to-launch:** a first campaign needs no separate "top up" step - write
  the ad, click "Pay $X & launch"; if it passes moderation but the wallet is
  short (a 402), the portal opens Razorpay for the shortfall, verifies
  synchronously, and relaunches -> live. Leftover seeds the wallet for repeat
  spend. Rejected ads never reach payment.
- **$6 starter budget** default; top-up suggestions $10 / INR900 (down from
  $50 / INR4,500).
- **Analytics:** dependency-free SVG charts (impressions area + clicks line, and
  spend), 7/30-day toggle, totals (impressions, clicks, CTR, spend), with hover
  tooltips.
- **Logo upload** to Supabase Storage; brand-color picker with a live status-bar
  preview (dark/light) that notes the text-tint limitation.

### Developer waitlist
Home-page email capture -> `waitlist` function. Purpose: aggregate demand
pre-launch and produce the "N developers waiting" number to pitch advertisers.

### Env (Vercel)
`NEXT_PUBLIC_API_BASE_URL` = `https://<project-ref>.functions.supabase.co`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public by design;
deny-all RLS protects data).

---

## 9. Owner/admin dashboard (`admin/`)

Vite 7 + React 18 + shadcn. Owner-gated (server-side `is_owner`). Components:
`Dashboard` (platform overview - developers, campaigns running, credits
earned/redeemed, outstanding liability, margin, ad performance, kill switch),
`Login`, `NewCampaignDialog`. The "+ New Campaign" button is hidden for owners
(owners monitor; advertisers create campaigns). Env: `VITE_API_BASE_URL`,
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (baked at build time).

---

## 10. Local mock server (`dev/mock-server.js`)

Zero-dependency Node `http` server (`npm run mock` -> `http://localhost:8787`).
Mirrors the **entire** API in memory (all endpoints, identity, wallet,
moderation, payments, analytics, redeem-models, waitlist, fx-rate). Used to
develop/test the extension, web, and admin without deploying. Payments
instant-credit locally; analytics synthesizes a demo series when there is no
real traffic. Seeded with a few demo ads (Vercel/Supabase/Snyk).

---

## 11. Security model

- **Deny-all RLS** everywhere; public anon/publishable keys can touch nothing.
  Only service-role Edge Functions read/write.
- **In-code auth** on every function (verify_jwt=false); developer endpoints
  derive identity from the verified token, never a client field.
- **Atomic + idempotent** crediting/redeeming/payment RPCs prevent
  double-count/double-spend under retries/concurrency.
- **Payments** credited only by signature-verified webhook or `/payment-verify`
  (HMAC). The client never credits.
- **Secrets** (service role, JWT secret, provisioning key, Upstash, payment
  secrets) live only in function env; the extension/web bundles carry none.
- **Extension privacy:** no workspace/file APIs; one anonymous device id; only
  the window-focused boolean; talks only to the configured https backend; minted
  OpenRouter key kept in OS keychain (SecretStorage).
- **Moderation** (auto-screen before serving): category keywords (adult,
  gambling, drugs, weapons, hate, malware/scam), URL structure (shorteners, risk
  TLDs, IP hosts), brand-impersonation, Google Safe Browsing, redirect tracing.
  Verdict -> approve / reject / flag.
- **Anti-fraud:** GitHub-verified identity; click must follow a viewed
  impression; per-ad 24h click cooldown; daily 10-click cap; per-event budget
  check; rate limiting (Upstash, fails closed in prod when set).

---

## 12. Key decisions and rationale (the journey)

- **Live FX, not a frozen rate.** Originally locked the currency AND froze the
  USD->INR rate 30 days. Reversed: freezing made the platform silently carry FX
  risk and turned the balance into a fiction. Now USD is the displayed unit, the
  rail is locked but the rate is live at each top-up -> zero FX risk, honest
  balance. (`831cc25`, replacing `2805540`.)
- **$6 CPM launch rate, dev reward protected.** Cut headline cost $10 -> $6 to
  attract advertisers; kept the dev reward at 4 credits (devs now keep ~67%) to
  protect the supply side. (`574a8a0`.)
- **Low-friction entry.** $6 starter budget + smaller top-up defaults
  (`ffdad83`), then **pay-to-launch** so the first campaign needs no separate
  wallet step (`88c8888`). Wallet kept as the ledger of record (refunds,
  leftovers, repeat spend).
- **Earnings as real money.** Lead with $ / INR, credits as a footnote, to make
  rewards feel tangible (`9dbef67`); adaptive precision so tiny earnings show
  (`901d057`).
- **Live, price-aware redeem catalog** replacing a hardcoded six models
  (`eac287a`).
- **Go-to-market:** developer **waitlist** (demand + advertiser proof) +
  **never-empty slot** so first-run is never empty/$0 (`0d52b40`, `43d2345`).
  Advertisers stay open self-serve; seed campaigns + concierge the first cohort.
- **Session isolation** so one person can be advertiser + developer
  simultaneously (`c35665c`).
- **No em-dashes / AI-style dividers** anywhere user-visible (and stripped from
  code comments) (`a13cbf6`, `af1ee88`).

---

## 13. Current state and go-to-market plan

**State:** code-complete at v0.1.0, pre-launch. Backend functions deployed;
Razorpay in **test mode** (a few days of testing before going live). Repo going
private. Extension packaged but not published.

**Planned sequence:**
1. Site live -> collect the **developer waitlist** (the "N waiting" number).
2. **Concierge-sell** the first advertisers using that number; comp/discount the
   first few for logos/case studies. Optionally seed your own funded campaigns so
   the slot is filled (pay-to-launch makes this trivial).
3. Flip earning on; the never-empty placeholder keeps the slot alive even if
   budgets lapse.

---

## 14. Deployment and open blockers

### Deploy commands (from `backend/`)
```bash
# sync schema/columns/tables on an existing DB
psql "$SUPABASE_DB_URL" -f migrate.sql
# deploy all functions
supabase functions deploy auth serve-ad track-event balance redeem-credits \
  redeem-models waitlist delete-data fx-rate advertiser-account \
  advertiser-campaigns advertiser-analytics payment-create payment-verify \
  payment-webhook-stripe payment-webhook-razorpay admin-ads admin-metrics \
  admin-flags
```
Web/admin deploy on Vercel from `web/` and `admin/`. Extension:
`npm run vsix` then `npm run publish:marketplace` (needs publisher + PAT).

### Open blockers before publishing
1. **`DEFAULT_API_BASE_URL`** in `src/config.ts` is a placeholder
   (`https://codeslot-api.functions.supabase.co`). Set it to the real
   `https://<project-ref>.functions.supabase.co` (same value as the web app's
   `NEXT_PUBLIC_API_BASE_URL`) and re-package.
2. **`MARKETING_URL`** in `src/config.ts` is a placeholder
   (`https://codeslot.dev`). Set to the real marketing site (the "Advertise on
   CodeSlot" placeholder links here).
3. **OpenRouter Provisioning key** - redemption mints keys via the Provisioning
   API; `/redeem-credits` returns 503 without `OPENROUTER_PROVISIONING_KEY`. The
   key on hand was reported as a "management key" only - this is the real blocker
   on the earn->redeem loop.
4. **Marketplace publisher + PAT** - create publisher `junaidbuilds` at
   marketplace.visualstudio.com/manage and a PAT with **Marketplace: Manage**
   scope. (Cannot be done programmatically.)

### Backend secrets (function env)
`CODESLOT_JWT_SECRET`, `OWNER_GITHUB_LOGINS`/`OWNER_GITHUB_IDS`,
`OPENROUTER_PROVISIONING_KEY`, `UPSTASH_REDIS_REST_URL`/`_TOKEN`,
`SAFE_BROWSING_API_KEY` (recommended), `RAZORPAY_KEY_ID`/`_KEY_SECRET`/
`_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`/`_WEBHOOK_SECRET` (Stripe currently OFF in
the UI), `USD_INR_RATE` (fallback), `CODESLOT_SITE_URL`. `SUPABASE_URL` and the
service-role key are injected by Supabase.

---

## 15. Notable nuances / gotchas

- **Stripe is built but OFF** in the UI (Indian Stripe is invite-only). Razorpay
  handles INR and USD (International Payments). All current flows are the
  on-page Razorpay modal (no redirect), which is why pay-to-launch works on one
  screen. If Stripe is enabled later, the redirect-resume path needs handling.
- **`migrate.sql` is required** on existing DBs - `create table if not exists`
  never adds columns to an existing table.
- **`ad_metrics` view** was dropped+recreated (not `create or replace`) when it
  gained `advertiser_id` - views cannot reorder columns in place.
- **Box-drawing dividers and em/en dashes** were intentionally removed from all
  UI and code; keep new contributions ASCII-only to match.
- **Repo `.temp/cli-latest`** (Supabase CLI) shows as a spurious modified file;
  ignore/restore it before commits.

---

## 16. Contact / business

- Support: `mohammedjunaidah@gmail.com`
- Phone: `+919866581615`
- Address: `302, S-2, Siva Towers, Tadepalle bypass, Vijayawada`
- Repo: `github.com/MdJunaidAhmed16/CodeSlot` (private)

---

## 17. Repo layout

```
CodeSlot/
  src/                    # VS Code extension (TypeScript)
  media/                  # extension webview assets + icon.png
  dist/                   # bundled extension.js (build output)
  backend/
    schema.sql            # tables, RLS, RPCs, views
    migrate.sql           # idempotent column/table sync
    seed.sql, storage.sql
    supabase/functions/   # 19 Edge Functions + _shared/
  web/                    # Next.js marketing site + advertiser portal
    app/  components/  lib/
  admin/                  # Vite owner/admin dashboard
  dev/mock-server.js      # zero-dependency local backend
  docs/                   # internal planning docs (PRD, architecture, etc.)
  package.json            # extension manifest (codeslot@0.1.0)
  README.md  CHANGELOG.md  LICENSE  DEPLOYMENT.md
  codeslot_v1.md          # this document
```

> Generated as a point-in-time snapshot at commit `af1ee88`. For the latest, the
> source of truth is always the code: `_shared/economics.ts` (rates),
> `schema.sql` (data model), `src/config.ts` (extension config), and the
> `feat(...)` commit history.
