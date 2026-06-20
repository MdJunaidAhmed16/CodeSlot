-- CodeSlot - Postgres schema (Supabase)
-- Run this in the Supabase SQL editor or via `supabase db push`.
--
-- Identity model (v1.1): users authenticate with GitHub. The credit ledger is
-- keyed to an internal user id that maps 1:1 to a GitHub account id - NOT to a
-- client-supplied value. This closes the credit-farming hole that an anonymous,
-- spoofable device id left open: earning requires a verified GitHub identity,
-- and abusive accounts can be banned.
--
-- Security model (see docs/03-SECURITY.md):
--   * Row Level Security is enabled and DENIES all access by default.
--   * No anon/authenticated policies are created, so the public API keys cannot
--     read or write these tables at all.
--   * Edge Functions connect with the SERVICE ROLE key (bypasses RLS) and are
--     the ONLY way data is touched - every write is behind token verification,
--     server-side validation, and rate limiting.

create extension if not exists "pgcrypto";

-- Advertisers
-- Advertisers authenticate via Supabase Auth (Google / GitHub). Their identity
-- is the Supabase auth user id; this table is our profile/role record. Kept
-- separate from `users` (which are GitHub-keyed developers who EARN credits).
create table if not exists advertisers (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique not null,        -- = auth.users.id (Supabase Auth)
  email         text,
  name          text,
  provider      text,                         -- 'google' | 'github'
  -- Prepaid balance in USD (the platform's base currency). Topped up via
  -- Stripe (USD) or Razorpay (INR→USD); campaign budgets are drawn from it.
  wallet_usd    numeric not null default 0 check (wallet_usd >= 0),
  -- Billing currency preference, locked for 30 days once chosen. The USD↔INR
  -- rate is frozen at selection time so the displayed balance never drifts and
  -- conversions stay consistent for the period.
  currency_pref text check (currency_pref in ('usd','inr')),
  currency_pref_set_at timestamptz,
  fx_rate_locked numeric,   -- USD→INR rate frozen when the pref is chosen
  banned        boolean not null default false,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

-- Payments
-- One row per top-up attempt. Crediting happens ONLY when a signature-verified
-- webhook flips status created → paid (idempotently). The client never credits.
create table if not exists payments (
  id            uuid primary key default gen_random_uuid(),
  advertiser_id uuid not null references advertisers(id) on delete cascade,
  provider      text not null check (provider in ('stripe','razorpay')),
  -- Stripe Checkout Session id, or Razorpay Order id. Unique per provider.
  provider_ref  text not null,
  currency      text not null,                 -- 'usd' | 'inr'
  amount_minor  bigint not null check (amount_minor > 0),  -- cents / paise
  amount_usd    numeric not null check (amount_usd > 0),   -- credited to wallet
  status        text not null default 'created'
                  check (status in ('created','paid','failed')),
  created_at    timestamptz not null default now(),
  paid_at       timestamptz,
  unique (provider, provider_ref)
);
create index if not exists payments_advertiser_idx on payments(advertiser_id, created_at desc);

-- Ads
create table if not exists ads (
  id                  uuid primary key default gen_random_uuid(),
  advertiser_id       uuid references advertisers(id) on delete cascade,
  advertiser_name     text    not null,
  text                text    not null check (char_length(text) <= 120),
  url                 text    not null,
  description         text,
  -- Moderation result. New submissions are auto-screened; only 'approved'
  -- ads are ever served. 'rejected' rows are kept for audit/appeal.
  status              text    not null default 'approved'
                        check (status in ('approved','rejected','pending','paused')),
  moderation_reason   text,
  -- Soft warning: the ad is approved & serving, but flagged as suspicious
  -- (e.g. redirects to a different domain). Surfaced in the owner dashboard.
  review_flag         text,
  brand_color         text    check (brand_color is null or brand_color ~* '^#[0-9a-f]{3,8}$'),
  logo_url            text    check (logo_url is null or logo_url ~* '^https://'),
  weight              int     not null default 1 check (weight >= 0),
  -- A campaign is billed by impressions (CPM) OR clicks (CPC), never both.
  billing_model       text    not null default 'cpm' check (billing_model in ('cpm','cpc')),
  budget_remaining    numeric not null default 0 check (budget_remaining >= 0),
  -- Defaults below are the CPM rate card; CPC campaigns override these so the
  -- unbilled side is 0 (no charge, no reward).
  cost_per_impression numeric not null default 0.006 check (cost_per_impression >= 0),  -- $6 CPM (launch rate)
  cost_per_click      numeric not null default 0     check (cost_per_click >= 0),
  reward_per_impression numeric not null default 4   check (reward_per_impression >= 0),  -- credits (~67% of $6 CPM)
  reward_per_click      numeric not null default 0  check (reward_per_click >= 0),        -- credits
  active              boolean not null default true,
  constraint ads_url_scheme check (url ~* '^https?://'),
  created_at          timestamptz not null default now()
);

-- Users
-- One row per GitHub account. `id` is the internal key used everywhere else.
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  github_id     bigint unique not null,
  github_login  text,
  -- is_owner = the product owner (you). Granted automatically at sign-in when
  -- the GitHub login/id is in the OWNER_GITHUB_* env allowlist. Owners can see
  -- the platform/financial dashboard and toggle the kill switch.
  is_owner      boolean not null default false,
  -- is_admin = may manage campaigns (owners are always admins).
  is_admin      boolean not null default false,
  banned        boolean not null default false,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

-- Impressions / clicks log
create table if not exists impressions (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references users(id) on delete cascade,
  ad_id       uuid not null references ads(id),
  event_type  text not null check (event_type in ('impression','click')),
  credits_awarded numeric not null check (credits_awarded >= 0),
  idempotency_key uuid not null,
  created_at  timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index if not exists impressions_user_idx on impressions(user_id, created_at desc);
create index if not exists impressions_ad_idx on impressions(ad_id, created_at desc);

-- Credit ledger
-- Append-only. Balance = sum(amount). Amounts are in CREDITS.
create table if not exists credit_ledger (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references users(id) on delete cascade,
  amount       numeric not null,
  reason       text not null check (reason in ('impression','click','redemption','adjustment')),
  reference_id bigint,
  created_at   timestamptz not null default now()
);
create index if not exists ledger_user_idx on credit_ledger(user_id);

-- Redemptions
create table if not exists redemptions (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references users(id) on delete cascade,
  credits_redeemed numeric not null check (credits_redeemed > 0),
  model            text,
  openrouter_amount numeric,
  openrouter_key_id text,  -- key hash only; the secret is shown to the user once
  status           text not null default 'pending'
                     check (status in ('pending','completed','failed')),
  idempotency_key  uuid not null,
  created_at       timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

-- Feature flags / kill switch
create table if not exists feature_flags (
  key   text primary key,
  value boolean not null default true
);
insert into feature_flags(key, value)
  values ('ad_serving_enabled', true)
  on conflict (key) do nothing;

-- Pre-launch developer waitlist
-- Public-facing email capture (inserted via the service role in the waitlist
-- function; RLS stays deny-all so the anon key can neither read nor write).
create table if not exists waitlist (
  id         bigint generated always as identity primary key,
  email      text not null unique,
  source     text,
  created_at timestamptz not null default now()
);

-- Helpers
create or replace function current_balance(p_user uuid)
returns numeric language sql stable as $$
  select coalesce(sum(amount), 0) from credit_ledger where user_id = p_user;
$$;

-- Upsert a user by GitHub id. `p_owner` is computed by the /auth function from
-- the OWNER_GITHUB_* allowlist; when true we (idempotently) promote the row to
-- owner+admin. Returns the resolved flags.
create or replace function upsert_github_user(
  p_github_id bigint, p_login text, p_owner boolean default false
)
returns table(id uuid, is_owner boolean, is_admin boolean, banned boolean)
language plpgsql as $$
declare v_id uuid; v_owner boolean; v_admin boolean; v_banned boolean;
begin
  insert into users(github_id, github_login, is_owner, is_admin)
    values (p_github_id, p_login, p_owner, p_owner)
    on conflict (github_id)
    do update set
      github_login = excluded.github_login,
      last_seen_at = now(),
      -- Only ever ADD owner/admin via the allowlist; never downgrade here.
      is_owner = users.is_owner or p_owner,
      is_admin = users.is_admin or p_owner
    returning users.id, users.is_owner, users.is_admin, users.banned
    into v_id, v_owner, v_admin, v_banned;
  return query select v_id, v_owner, v_admin, v_banned;
end;
$$;

-- Atomic event ingestion RPC
create or replace function record_event(
  p_user uuid,
  p_ad uuid,
  p_event text,
  p_idem uuid
) returns table(credits_earned numeric, new_balance numeric)
language plpgsql as $$
declare
  v_reward numeric;
  v_cost numeric;
  v_budget numeric;
  v_imp_id bigint;
  v_existing numeric;
begin
  select credits_awarded into v_existing
  from impressions where user_id = p_user and idempotency_key = p_idem;
  if found then
    return query select v_existing, current_balance(p_user);
    return;
  end if;

  -- Lock the ad row and read its reward, cost, and remaining budget together.
  if p_event = 'click' then
    select reward_per_click, cost_per_click, budget_remaining
      into v_reward, v_cost, v_budget
      from ads where id = p_ad and active for update;
  else
    select reward_per_impression, cost_per_impression, budget_remaining
      into v_reward, v_cost, v_budget
      from ads where id = p_ad and active for update;
  end if;

  -- No such active ad → never credit (covers "no advertisers" entirely).
  if v_reward is null then
    raise exception 'ad not available';
  end if;

  -- Anti-fraud: a paid click must follow a genuine view. Only credit a click
  -- if this user actually had an impression of this ad in the last 30 minutes.
  -- (Impressions are logged for CPC ads too, just with zero reward.)
  if p_event = 'click' and v_reward > 0 then
    if not exists (
      select 1 from impressions
      where user_id = p_user and ad_id = p_ad and event_type = 'impression'
        and created_at > now() - interval '30 minutes'
    ) then
      return query select 0::numeric, current_balance(p_user);
      return;
    end if;
  end if;

  -- CORE INVARIANT: a developer is only credited when a real advertiser pays
  -- for this event. If this event type carries a cost (the campaign's billed
  -- side) but the budget can't cover it, award nothing.
  if v_cost > 0 and v_budget < v_cost then
    return query select 0::numeric, current_balance(p_user);
    return;
  end if;

  -- Always log the event (for advertiser analytics / CTR), even on the
  -- unbilled side (e.g. impressions of a CPC campaign).
  insert into impressions(user_id, ad_id, event_type, credits_awarded, idempotency_key)
    values (p_user, p_ad, p_event, v_reward, p_idem)
    returning id into v_imp_id;

  -- Credit the developer only when there is a reward (billed side).
  if v_reward > 0 then
    insert into credit_ledger(user_id, amount, reason, reference_id)
      values (p_user, v_reward, p_event, v_imp_id);
  end if;

  -- Charge the advertiser only when there is a cost (billed side).
  if v_cost > 0 then
    update ads set budget_remaining = budget_remaining - v_cost where id = p_ad;
  end if;

  return query select v_reward, current_balance(p_user);
end;
$$;

-- Atomic, idempotent redemption
create or replace function redeem_credits(
  p_user uuid,
  p_amount numeric,
  p_model text,
  p_or_amount numeric,
  p_idem uuid
) returns table(new_balance numeric, redemption_id bigint)
language plpgsql as $$
declare
  v_balance numeric;
  v_existing bigint;
  v_red_id bigint;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid amount';
  end if;

  select id into v_existing
    from redemptions where user_id = p_user and idempotency_key = p_idem;
  if found then
    return query select current_balance(p_user), v_existing;
    return;
  end if;

  -- Lock this user's ledger so concurrent redemptions can't both pass the check.
  perform 1 from credit_ledger where user_id = p_user for update;
  v_balance := current_balance(p_user);
  if v_balance < p_amount then
    raise exception 'insufficient balance';
  end if;

  insert into redemptions(user_id, credits_redeemed, model, openrouter_amount, status, idempotency_key)
    values (p_user, p_amount, p_model, p_or_amount, 'completed', p_idem)
    returning id into v_red_id;

  insert into credit_ledger(user_id, amount, reason, reference_id)
    values (p_user, -p_amount, 'redemption', v_red_id);

  return query select current_balance(p_user), v_red_id;
end;
$$;

-- Hard-delete a user's data (GDPR). Cascades to child tables.
create or replace function delete_user(p_user uuid)
returns void language sql as $$
  delete from users where id = p_user;
$$;

-- Payments: idempotent credit + wallet spend
-- Flip a payment created → paid and credit the advertiser's wallet, exactly
-- once. Safe to call repeatedly (webhook retries) - returns the new balance.
create or replace function confirm_payment(p_provider text, p_ref text)
returns table(advertiser_id uuid, amount_usd numeric, new_balance numeric, already boolean)
language plpgsql as $$
declare v_pay payments%rowtype;
begin
  select * into v_pay from payments
    where provider = p_provider and provider_ref = p_ref for update;
  if not found then
    raise exception 'payment not found';
  end if;

  if v_pay.status = 'paid' then
    return query select v_pay.advertiser_id, v_pay.amount_usd,
      (select wallet_usd from advertisers where id = v_pay.advertiser_id), true;
    return;
  end if;

  update payments set status = 'paid', paid_at = now() where id = v_pay.id;
  update advertisers set wallet_usd = wallet_usd + v_pay.amount_usd
    where id = v_pay.advertiser_id;

  return query select v_pay.advertiser_id, v_pay.amount_usd,
    (select wallet_usd from advertisers where id = v_pay.advertiser_id), false;
end;
$$;

-- Add to a wallet (refund / manual adjustment).
create or replace function add_wallet(p_advertiser uuid, p_amount numeric)
returns void language sql as $$
  update advertisers set wallet_usd = wallet_usd + p_amount where id = p_advertiser;
$$;

-- Atomically deduct from a wallet if the balance covers it. Returns true on
-- success, false if insufficient. Used to fund a campaign at creation.
create or replace function spend_wallet(p_advertiser uuid, p_amount numeric)
returns boolean language plpgsql as $$
declare v_balance numeric;
begin
  if p_amount is null or p_amount < 0 then
    raise exception 'invalid amount';
  end if;
  select wallet_usd into v_balance from advertisers where id = p_advertiser for update;
  if v_balance is null or v_balance < p_amount then
    return false;
  end if;
  update advertisers set wallet_usd = wallet_usd - p_amount where id = p_advertiser;
  return true;
end;
$$;

-- Admin metrics view
drop view if exists ad_metrics;
create view ad_metrics as
  select
    a.id,
    a.advertiser_id,
    a.advertiser_name,
    a.text,
    a.active,
    a.status,
    a.review_flag,
    a.budget_remaining,
    a.weight,
    count(*) filter (where i.event_type = 'impression') as impressions,
    count(*) filter (where i.event_type = 'click')      as clicks,
    coalesce(sum(case when i.event_type = 'impression' then a.cost_per_impression
                      when i.event_type = 'click' then a.cost_per_click else 0 end), 0) as spend
  from ads a
  left join impressions i on i.ad_id = a.id
  group by a.id;

-- Daily impressions / clicks / spend for one advertiser over the last N days.
-- Powers the portal's over-time charts. Gaps are filled with zero rows so the
-- series is always exactly p_days long and chronological.
create or replace function advertiser_daily_metrics(
  p_advertiser uuid,
  p_days       integer default 30
)
returns table(day date, impressions bigint, clicks bigint, spend_usd numeric)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.day::date as day,
    count(i.id) filter (where i.event_type = 'impression') as impressions,
    count(i.id) filter (where i.event_type = 'click')      as clicks,
    coalesce(sum(case when i.event_type = 'impression' then a.cost_per_impression
                      when i.event_type = 'click'      then a.cost_per_click end), 0) as spend_usd
  from generate_series(current_date - (p_days - 1), current_date, interval '1 day') as g(day)
  left join ads a on a.advertiser_id = p_advertiser
  left join impressions i
    on i.ad_id = a.id and i.created_at::date = g.day::date
  group by g.day
  order by g.day;
$$;

-- Lock down with RLS (deny-all)
alter table ads            enable row level security;
alter table advertisers    enable row level security;
alter table payments       enable row level security;
alter table users          enable row level security;
alter table impressions    enable row level security;
alter table credit_ledger  enable row level security;
alter table redemptions    enable row level security;
alter table feature_flags  enable row level security;
alter table waitlist       enable row level security;
-- No policies → anon/authenticated roles get zero rows. Service role bypasses.

-- To grant yourself admin after first sign-in:
--   update users set is_admin = true where github_login = '<your-handle>';
