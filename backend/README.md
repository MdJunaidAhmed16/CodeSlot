# CodeSlot Backend (Supabase)

Serverless backend for the CodeSlot extension: Postgres + Edge Functions
(Deno), with Upstash Redis for rate limiting and frequency capping.

## Layout

```
backend/
├── schema.sql                     # tables, RLS (deny-all), and SECURITY-definer RPCs
├── seed.sql                       # 3–5 starter ads
└── supabase/
    ├── config.toml                # verify_jwt=false (auth is enforced in-code)
    └── functions/
        ├── _shared/               # http, service client, rate limiter, auth, admin guard
        ├── auth/                  # POST GitHub token → CodeSlot session token (JWT)
        ├── serve-ad/              # GET  next ad (anonymous, weighted, kill-switch aware)
        ├── track-event/           # POST impression/click → credits (AUTH, atomic, idempotent)
        ├── balance/               # GET  balance + today + recent (AUTH)
        ├── redeem-credits/        # POST credits → OpenRouter key (AUTH, atomic, idempotent)
        ├── delete-data/           # POST hard-delete the user's data (AUTH)
        ├── admin-metrics/         # GET  platform overview (ADMIN)
        ├── admin-ads/             # GET/POST/PATCH ad CRUD (ADMIN)
        └── admin-flags/           # POST kill switch (ADMIN)
```

## Identity & auth

Users sign in with GitHub (via VS Code's native auth provider in the extension,
or Supabase Auth in the dashboard). The `/auth` function verifies the GitHub
token against the GitHub API, upserts a user keyed by **GitHub id**, and issues
a signed CodeSlot session token (HS256 JWT). User-scoped endpoints derive the
identity from this verified token — never from a client field — so credits can
only ever be attributed to a real, verified account. This closes the
credit-farming hole that an anonymous device id left open.

Admin endpoints additionally require `users.is_admin = true` (checked against
the DB, not just the token claim).

## Security model

- **RLS is deny-all.** No anon/authenticated policies exist, so the public API
  keys can't touch any table. Only Edge Functions (service role) read/write,
  and every write goes through validation + rate limiting.
- **All crediting/redeeming is done in `SECURITY`-relevant RPCs** (`record_event`,
  `redeem_credits`) that are atomic and idempotent, preventing double-counting
  and double-spend even under retries or concurrency.
- **Balances are always recomputed server-side** from the append-only ledger.
- **Secrets** (`SUPABASE_SERVICE_ROLE_KEY`, Upstash creds) live only in Edge
  Function env, never in the client.

## Deploy

```bash
# 1. Create project + push schema
supabase link --project-ref <your-ref>
supabase db push                 # or run schema.sql in the SQL editor
psql "$DATABASE_URL" -f seed.sql # seed starter ads

# 2. Set secrets  (see DEPLOYMENT.md for the full table)
supabase secrets set \
  UPSTASH_REDIS_REST_URL=... \
  UPSTASH_REDIS_REST_TOKEN=... \
  CODESLOT_JWT_SECRET="$(openssl rand -hex 32)" \
  OWNER_GITHUB_LOGINS="your-github-handle" \
  OWNER_GITHUB_IDS="<your-numeric-github-id>" \
  OPENROUTER_PROVISIONING_KEY=sk-or-prov-...
# SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
# The account in OWNER_GITHUB_* becomes owner+admin automatically on first sign-in.

# 2b. Already have a DB from a previous run? Sync new columns first.
#     (schema.sql's `create table if not exists` never adds columns to an
#      existing table, so run the idempotent migration before deploying.)
psql "$SUPABASE_DB_URL" -f migrate.sql   # or paste migrate.sql in the SQL editor

# 3. Deploy functions
supabase functions deploy auth serve-ad track-event balance redeem-credits \
  delete-data advertiser-campaigns payment-create payment-webhook-stripe \
  payment-webhook-razorpay admin-metrics admin-ads admin-flags

# 4. Grant yourself admin (after signing in once from the extension/dashboard)
#   update users set is_admin = true where github_login = '<your-handle>';
```

Required secrets:
| Secret | Purpose |
|---|---|
| `CODESLOT_JWT_SECRET` | Signs session tokens (≥32 chars). |
| `OPENROUTER_PROVISIONING_KEY` | Mints user keys at redemption. Without it, `/redeem-credits` returns 503. |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Rate limiting + frequency caps. |

Then set the deployed base URL as `DEFAULT_API_BASE_URL` in
`src/config.ts` and rebuild the extension.

## Kill switch

```sql
update feature_flags set value = false where key = 'ad_serving_enabled';
```
`/serve-ad` immediately stops returning ads (no extension update needed).
