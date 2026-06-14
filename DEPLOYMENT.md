# CodeSlot — Secure Deployment Guide

End-to-end steps to deploy the three pieces — **backend** (Supabase),
**owner/advertiser dashboard** (Vercel), and **extension** (VS Code Marketplace)
— with the security controls turned on.

> Identity model: developers sign in with **GitHub**; the credit ledger is keyed
> to the verified GitHub account (not a spoofable id). You — the product **owner**
> — are detected automatically from a GitHub allowlist and are the only account
> that can open the platform dashboard.

---

## 0. Prerequisites

- A [Supabase](https://supabase.com) project (free tier is fine).
- An [Upstash Redis](https://upstash.com) database (free tier) — rate limiting.
- An [OpenRouter](https://openrouter.ai) account with a **Provisioning API key**
  (Settings → Provisioning API Keys) — used to mint user keys at redemption.
- `supabase` CLI installed and logged in (`supabase login`).
- Your **GitHub username** (and ideally your numeric GitHub id — get it from
  `https://api.github.com/users/<you>` → `id`).

---

## 1. Database schema + seed

```bash
cd backend
supabase link --project-ref <your-project-ref>
supabase db push                       # applies schema.sql (tables, RLS, RPCs)
# or paste schema.sql into the Supabase SQL editor and run it
psql "$SUPABASE_DB_URL" -f storage.sql # ad-logos storage bucket + policies
psql "$SUPABASE_DB_URL" -f seed.sql    # optional: 3–4 starter ads
```

The schema enables **deny-all RLS** on every table — the public anon key cannot
read or write anything. All access is via Edge Functions using the service role.

---

## 2. Backend secrets (the security-critical part)

```bash
supabase secrets set \
  CODESLOT_JWT_SECRET="$(openssl rand -hex 32)" \
  OWNER_GITHUB_LOGINS="your-github-handle" \
  OWNER_GITHUB_IDS="<your-numeric-github-id>" \
  OPENROUTER_PROVISIONING_KEY="sk-or-prov-..." \
  UPSTASH_REDIS_REST_URL="https://...upstash.io" \
  UPSTASH_REDIS_REST_TOKEN="..."
# SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
```

| Secret | Purpose | Notes |
|---|---|---|
| `CODESLOT_JWT_SECRET` | Signs session tokens (HS256) | **≥32 chars, random.** Rotating it logs everyone out. |
| `OWNER_GITHUB_LOGINS` | Auto-grants **owner** on sign-in | Comma-separated, case-insensitive. |
| `OWNER_GITHUB_IDS` | Same, by immutable id | **Preferred** — logins can be renamed/reused. Set both. |
| `OPENROUTER_PROVISIONING_KEY` | Mints user keys at redemption | Without it `/redeem-credits` returns 503 (no silent failure). |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Rate limits + frequency caps | Without Redis the limiter "fails open" — set it in production. |
| `SAFE_BROWSING_API_KEY` | Ad URL malware/phishing screen | **Recommended.** Enables the Google Safe Browsing check in ad moderation. Without it, keyword + URL-structure + brand screens still run, but known-malware URLs aren't caught. Get a key from Google Cloud → Safe Browsing API. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | USD top-ups (Stripe Checkout) | Required for USD payments. Webhook secret signs `payment-webhook-stripe`. |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | INR top-ups (Razorpay) | Required for INR payments. Webhook secret signs `payment-webhook-razorpay`. |
| `USD_INR_RATE` | INR→USD conversion | Optional; defaults to `83`. Credits INR top-ups to the USD wallet at this rate. |
| `CODESLOT_SITE_URL` | Stripe success/cancel redirect | Your deployed marketing-site URL (e.g. `https://codeslot.dev`). |

> **You become owner automatically.** The first time you sign in (from the
> extension or the dashboard) with a GitHub account in `OWNER_GITHUB_LOGINS` /
> `OWNER_GITHUB_IDS`, the `/auth` function sets `is_owner = is_admin = true` for
> your row. No manual SQL needed. Everyone else is a normal developer.

---

## 3. Deploy the Edge Functions

```bash
supabase functions deploy \
  auth serve-ad track-event balance redeem-credits delete-data \
  advertiser-campaigns payment-create payment-webhook-stripe payment-webhook-razorpay \
  admin-ads admin-metrics admin-flags
```

`config.toml` sets `verify_jwt = false` on all of them — authentication is
enforced **in-code** (we verify our own GitHub-derived session token), which is
stricter and lets `serve-ad` stay anonymous.

Your backend base URL is:
`https://<project-ref>.functions.supabase.co`

Quick check:
```bash
curl -s "https://<project-ref>.functions.supabase.co/serve-ad?device_id=$(uuidgen)"
```

---

## 4. GitHub OAuth for the dashboard

The dashboard signs in with GitHub via **Supabase Auth** (no custom OAuth code).

1. GitHub → Settings → Developer settings → **OAuth Apps** → New OAuth App.
   - Homepage URL: your dashboard URL (e.g. `https://admin.codeslot.dev`).
   - Authorization callback URL:
     `https://<project-ref>.supabase.co/auth/v1/callback`
2. Supabase dashboard → Authentication → Providers → **GitHub** → paste the
   OAuth app's Client ID + Secret → enable.
3. **Advertisers also sign in with Google** → Authentication → Providers →
   **Google** → create a Google OAuth client (Google Cloud Console → Credentials
   → OAuth client → Web), callback `https://<project-ref>.supabase.co/auth/v1/callback`
   → paste Client ID + Secret → enable.
4. Authentication → URL Configuration → add the **dashboard** AND **marketing
   site** origins to **Redirect URLs**.

> Identity recap: the **extension/owner dashboard** uses GitHub and trades the
> token for a CodeSlot JWT at `/auth`. The **advertiser portal** uses Supabase
> Auth (Google/GitHub) directly; advertiser endpoints verify the Supabase token
> server-side. Two separate roles, no shared credentials.

---

## 5. Deploy the dashboard (Vercel)

```bash
cd admin
# Build settings: framework = Vite, build = `npm run build`, output = dist
```

Set these environment variables in Vercel:

| Var | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://<project-ref>.functions.supabase.co` |
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | your project's anon/publishable key |

The anon key is safe to ship: RLS is deny-all, so it grants no data access — it
only drives the Supabase Auth OAuth handshake. The dashboard then exchanges the
GitHub token at `/auth` for a CodeSlot session.

**Access:** only your owner account can load the dashboard — `admin-metrics` and
the kill switch are owner-gated server-side; a non-owner sees "restricted to the
product owner." The **+ New Campaign** button is hidden for owners (you monitor;
advertisers/admins create campaigns).

---

## 5b. Deploy the marketing site + advertiser portal (Vercel)

The public site (home, pricing, how-it-works, **Terms & Acceptable Use**) plus
advertiser register/login and the campaign portal live in `web/` (Next.js).

1. Vercel → **Add New → Project** → import the repo → **Root Directory = `web`**
   (Next.js auto-detected).
2. Environment variables:

   | Var | Value |
   |---|---|
   | `NEXT_PUBLIC_API_BASE_URL` | `https://<project-ref>.functions.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon/publishable key |

3. Deploy. Add the site's origin to Supabase Auth → **Redirect URLs** (step 4).

**Advertiser flow:** sign in with Google/GitHub → submit a campaign → it's
**auto-moderated** (adult/gambling/malware/phishing/brand-impersonation +
URL-structure + Safe Browsing + **redirect tracing** to the real destination).
Clean campaigns go **live instantly**; unsafe ones are **rejected with a reason**
and never serve. Suspicious-but-not-malicious campaigns (e.g. redirecting to a
different domain) are approved but **flagged** — visible to the owner on the
Platform dashboard ("Flagged for review") so you can pause them if needed.

---

## 5c. Payments — Stripe (USD) + Razorpay (INR), geo-routed

Advertisers top up a **prepaid USD wallet**; campaign budgets draw from it.
Currency is auto-selected by geo (India → INR/Razorpay, else USD/Stripe) with a
manual toggle. **The wallet is credited only by signature-verified webhooks** —
never by the client.

**Stripe (USD)**
1. Stripe dashboard → Developers → **Webhooks** → Add endpoint:
   `https://<project-ref>.functions.supabase.co/payment-webhook-stripe`
2. Subscribe to event **`checkout.session.completed`** → copy the **Signing
   secret** → set `STRIPE_WEBHOOK_SECRET`. Set `STRIPE_SECRET_KEY` from API keys.

**Razorpay (INR)**
1. Razorpay dashboard → Settings → **Webhooks** → Add:
   `https://<project-ref>.functions.supabase.co/payment-webhook-razorpay`
2. Subscribe to **`payment.captured`** (and `order.paid`) → set a secret →
   `RAZORPAY_WEBHOOK_SECRET`. Set `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`.

Set `USD_INR_RATE` (default 83) and `CODESLOT_SITE_URL` (for Stripe redirects).

**Security:** card data never touches our servers (hosted Stripe Checkout /
Razorpay Checkout). Webhooks verify HMAC-SHA256 signatures (Stripe also enforces
a 5-minute timestamp window against replay). Crediting is atomic + idempotent
(`confirm_payment`), so webhook retries never double-credit.

> Test the wallet end-to-end locally first: `npm run mock` simulates instant
> top-ups (no real Stripe/Razorpay), so the portal's Add Funds → balance →
> fund-a-campaign flow works offline.

### Where the money lives & how you get paid

You do **not** link a bank account anywhere in this codebase. Advertiser cash
lands in **your Stripe and Razorpay balances** — those *are* the platform wallet.
Link your bank **once in each provider's dashboard**; they pay out to it
automatically (or on a manual trigger). OpenRouter is your **cost**: minting keys
at redemption draws down your OpenRouter balance (top it up from your card/bank).

The owner dashboard's **Treasury** panel shows the live position:
`collected − OpenRouter spent − owed-to-advertisers − developer-liability =
distributable profit`. Keep the liabilities in reserve; the distributable figure
is what's safe to withdraw.

---

## 6. Point the extension at production & publish

1. In `src/config.ts`, set `DEFAULT_API_BASE_URL` to your Functions URL.
2. Build & package:
   ```bash
   npm run package
   npx vsce package --no-dependencies      # produces codeslot-x.y.z.vsix
   ```
3. Publish to the Marketplace:
   ```bash
   npx vsce publish                         # needs a publisher + PAT
   ```

The extension uses VS Code's **native GitHub provider** — no secrets ship in it.

---

## 7. Security checklist (verify before launch)

- [ ] **RLS deny-all** confirmed (run `select * from ads` with the anon key → 0 rows).
- [ ] `CODESLOT_JWT_SECRET` is ≥32 random chars and not in any repo.
- [ ] `OWNER_GITHUB_IDS` set (not just logins) so ownership can't be hijacked by a renamed handle.
- [ ] Service role key never appears in the extension, the dashboard, or git.
- [ ] All endpoints are HTTPS (Supabase Functions are; the extension refuses non-https except `localhost`).
- [ ] Auth is enforced on `track-event`, `balance`, `redeem-credits`, `delete-data` (401 without a token).
- [ ] `admin-metrics` / `admin-flags` return 403 for a non-owner; `admin-ads` 403 for a non-admin.
- [ ] Redemption is idempotent and refunds on OpenRouter failure (test with a bad provisioning key once in staging).
- [ ] Upstash configured so rate limits actually apply.
- [ ] Ad URLs reviewed before insert (only http/https; a Safe-Browsing check is recommended for paid ads).

### Defense-in-depth already built in
- Identity is derived from a **verified, signed token** server-side — clients never assert who they are.
- Crediting/redeeming run in **atomic, idempotent** Postgres functions (no double-count / double-spend under retries or concurrency).
- Balances are **recomputed server-side**; client numbers are never trusted.
- Webviews use a strict **nonce CSP** (`default-src 'none'`, `connect-src 'none'`).
- Per-user **rate limits + frequency caps**; anti-sybil filter rejects GitHub accounts < 7 days old.

---

## 8. Incident response — kill switch

Disable all ad serving instantly without redeploying:

```sql
update feature_flags set value = false where key = 'ad_serving_enabled';
```
…or flip the **Ad serving** toggle on the dashboard. `/serve-ad` immediately
returns no ads. To ban an abusive account: `update users set banned = true where github_login = '...';`
