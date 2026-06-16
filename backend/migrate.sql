-- CodeSlot — idempotent migration.
--
-- Run this on an EXISTING database any time you pull schema changes. It is safe
-- to run repeatedly. It exists because schema.sql uses `create table if not
-- exists`, which never ADDS columns to a table that already exists — so columns
-- added in later iterations must be applied with explicit ALTERs (below).
--
-- After running this, your functions/views are refreshed too. Nothing here
-- drops data.

create extension if not exists "pgcrypto";

-- Make sure newer tables exist (no-op if they already do).
create table if not exists advertisers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique not null,
  email text, name text, provider text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- ───────────── advertisers: columns added over time ─────────────
alter table advertisers add column if not exists wallet_usd numeric not null default 0;
alter table advertisers add column if not exists currency_pref text;
alter table advertisers add column if not exists currency_pref_set_at timestamptz;
alter table advertisers add column if not exists fx_rate_locked numeric;
alter table advertisers add column if not exists banned boolean not null default false;

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  advertiser_id uuid not null references advertisers(id) on delete cascade,
  provider text not null,
  provider_ref text not null,
  currency text not null,
  amount_minor bigint not null,
  amount_usd numeric not null,
  status text not null default 'created',
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (provider, provider_ref)
);
create index if not exists payments_advertiser_idx on payments(advertiser_id, created_at desc);

-- ───────────── ads: columns added over time ─────────────────────
alter table ads add column if not exists advertiser_id uuid references advertisers(id) on delete cascade;
alter table ads add column if not exists status text not null default 'approved';
alter table ads add column if not exists moderation_reason text;
alter table ads add column if not exists review_flag text;
alter table ads add column if not exists brand_color text;
alter table ads add column if not exists logo_url text;
alter table ads add column if not exists billing_model text not null default 'cpm';
-- Rate-card defaults (only affect NEW inserts; existing rows keep their values).
alter table ads alter column cost_per_click set default 0;
alter table ads alter column reward_per_impression set default 4;
alter table ads alter column reward_per_click set default 0;

-- ───────────── redemptions / users ──────────────────────────────
alter table redemptions add column if not exists openrouter_key_id text;
alter table users add column if not exists is_owner boolean not null default false;
alter table users add column if not exists banned boolean not null default false;

-- ───────────── check constraints (guarded so re-runs are safe) ───
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'advertisers_currency_pref_check') then
    alter table advertisers add constraint advertisers_currency_pref_check
      check (currency_pref is null or currency_pref in ('usd','inr'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ads_status_check') then
    alter table ads add constraint ads_status_check
      check (status in ('approved','rejected','pending','paused'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ads_billing_model_check') then
    alter table ads add constraint ads_billing_model_check
      check (billing_model in ('cpm','cpc'));
  end if;
end $$;

-- ───────────── refresh the metrics view (uses newer ad columns) ──
-- Dropped + recreated (not `create or replace`) because it gained an
-- advertiser_id column, and a view's columns can't be reordered in place.
drop view if exists ad_metrics;
create view ad_metrics as
  select
    a.id, a.advertiser_id, a.advertiser_name, a.text, a.active, a.status, a.review_flag,
    a.budget_remaining, a.weight,
    count(*) filter (where i.event_type = 'impression') as impressions,
    count(*) filter (where i.event_type = 'click')      as clicks,
    coalesce(sum(case when i.event_type = 'impression' then a.cost_per_impression
                      when i.event_type = 'click' then a.cost_per_click else 0 end), 0) as spend
  from ads a
  left join impressions i on i.ad_id = a.id
  group by a.id;

-- Daily metrics function for the portal's over-time charts (idempotent).
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

-- ───────────── keep RLS locked down (idempotent) ────────────────
alter table ads            enable row level security;
alter table advertisers    enable row level security;
alter table payments       enable row level security;
alter table users          enable row level security;
alter table impressions    enable row level security;
alter table credit_ledger  enable row level security;
alter table redemptions    enable row level security;
alter table feature_flags  enable row level security;

-- NOTE: this migration syncs TABLES/COLUMNS/VIEW only. The functions/RPCs are
-- all `create or replace` in schema.sql — re-run schema.sql's function section
-- (or the whole file; it's safe) to refresh record_event, redeem_credits, etc.
