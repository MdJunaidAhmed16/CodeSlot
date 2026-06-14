# CodeSlot — Architecture

## 1. High-Level Diagram

```
┌─────────────────────────────┐
│   VS Code Extension (TS)     │
│                               │
│  ┌─────────────────────┐    │
│  │ StatusBarAdItem      │    │
│  │ - renders ad text     │    │
│  │ - click handler        │    │
│  └─────────────────────┘    │
│  ┌─────────────────────┐    │
│  │ ImpressionTracker     │    │
│  │ - 5s dwell timer       │    │
│  │ - batches events        │    │
│  └─────────────────────┘    │
│  ┌─────────────────────┐    │
│  │ DeviceIdentity         │    │
│  │ - UUID stored in        │    │
│  │   globalState           │    │
│  └─────────────────────┘    │
└──────────────┬────────────────┘
               │ HTTPS
               ▼
┌─────────────────────────────┐
│   Supabase Edge Functions     │
│   (Deno, serverless)          │
│                               │
│  /serve-ad                    │
│  /track-event                 │
│  /redeem-credits               │
│  /balance                      │
└──────────────┬────────────────┘
               │
        ┌──────┴───────┐
        ▼              ▼
┌──────────────┐ ┌──────────────┐
│  Supabase     │ │  Upstash      │
│  Postgres     │ │  Redis         │
│                │ │                │
│ - ads          │ │ - ad rotation  │
│ - users        │ │   queue        │
│ - impressions  │ │ - rate limits  │
│ - credit_ledger│ │ - dedup cache  │
└──────────────┘ └──────────────┘
               │
               ▼
       ┌───────────────┐
       │  OpenRouter API │
       │  (credit top-up) │
       └───────────────┘
```

## 2. Component Breakdown

### 2.1 VS Code Extension

**Tech stack**: TypeScript, VS Code Extension API

**Modules:**

- `extension.ts` — activation entry point, registers status bar item, starts polling
- `statusBarAd.ts` — renders current ad (text + tooltip + command on click)
- `adFetcher.ts` — polls `/serve-ad` every 5–10 minutes, caches current ad
- `impressionTracker.ts` — starts a timer when ad is visible & VS Code window is focused; after 5s continuous visibility, fires impression event
- `deviceIdentity.ts` — generates/persists UUID in `context.globalState`
- `creditBalance.ts` — fetches and displays balance via `/balance`, shown in tooltip
- `redeemCommand.ts` — command palette action to trigger redemption flow (opens webview with OpenRouter linking)

**State management**: Extension's `globalState` for device ID, cached ad, last-shown timestamps (for frequency capping client-side as a first line of defense).

### 2.2 Supabase Edge Functions

All functions are Deno-based serverless functions deployed via Supabase CLI.

#### `/serve-ad` (GET)
- Input: `device_id`
- Logic: pulls next ad from Upstash rotation queue (round-robin or weighted by remaining budget), checks frequency cap for this device (via Redis), returns ad payload
- Output: `{ ad_id, text, url, weight }`

#### `/track-event` (POST)
- Input: `{ device_id, ad_id, event_type: 'impression' | 'click', timestamp }`
- Logic:
  - Validates event (rate-limit per device via Redis to prevent spam)
  - Inserts row into `impressions` table
  - Calculates credit reward based on `event_type` and current rate config
  - Updates `credit_ledger` (append-only ledger, balance = sum)
- Output: `{ success: true, credits_earned, new_balance }`

#### `/balance` (GET)
- Input: `device_id`
- Output: `{ balance, lifetime_earned, lifetime_redeemed }`

#### `/redeem-credits` (POST)
- Input: `{ device_id, openrouter_api_key_or_account_id, credits_to_redeem }`
- Logic:
  - Validates sufficient balance
  - Calls OpenRouter API to apply credit (mechanism TBD — see Open Questions in PRD)
  - On success, deducts from ledger, logs redemption record
- Output: `{ success, new_balance, openrouter_credit_applied }`

### 2.3 Data Layer

#### Supabase Postgres Schema

```sql
-- Ads table (manually populated in v1)
create table ads (
  id uuid primary key default gen_random_uuid(),
  advertiser_name text not null,
  text text not null,
  url text not null,
  weight int default 1,           -- relative frequency in rotation
  budget_remaining numeric,         -- in credits, decrements per impression/click
  cost_per_impression numeric default 0.01,
  cost_per_click numeric default 0.10,
  active boolean default true,
  created_at timestamptz default now()
);

-- Users (anonymous, device-based)
create table users (
  device_id uuid primary key,
  created_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  openrouter_account_ref text       -- set when user links OpenRouter
);

-- Impressions/clicks log (append-only, source of truth for analytics)
create table impressions (
  id bigint generated always as identity primary key,
  device_id uuid references users(device_id),
  ad_id uuid references ads(id),
  event_type text check (event_type in ('impression','click')),
  credits_awarded numeric not null,
  created_at timestamptz default now()
);

-- Credit ledger (append-only, balance = sum of amounts)
create table credit_ledger (
  id bigint generated always as identity primary key,
  device_id uuid references users(device_id),
  amount numeric not null,          -- positive for earn, negative for redeem
  reason text not null,              -- 'impression', 'click', 'redemption'
  reference_id bigint,                -- links to impressions.id or redemption record
  created_at timestamptz default now()
);

-- Redemptions
create table redemptions (
  id bigint generated always as identity primary key,
  device_id uuid references users(device_id),
  credits_redeemed numeric not null,
  openrouter_amount numeric,
  status text default 'pending',     -- pending | completed | failed
  created_at timestamptz default now()
);
```

#### Upstash Redis Usage

- `ad_rotation_queue` — sorted set or list for weighted round-robin
- `freq_cap:{device_id}:{ad_id}` — TTL key, prevents repeat ad within cooldown window
- `rate_limit:{device_id}` — sliding window counter to prevent event-spam abuse

## 3. Data Flow

1. Extension activates → checks `globalState` for `device_id`, generates if missing → registers with `/serve-ad` (implicitly via first call)
2. Every 5–10 min, extension calls `/serve-ad?device_id=...` → receives ad → renders in status bar
3. `impressionTracker` watches visibility + window focus → after 5s continuous, calls `/track-event` with `event_type: impression`
4. On click, extension opens `url` in browser AND calls `/track-event` with `event_type: click`
5. Edge function validates, logs to `impressions`, appends to `credit_ledger`, decrements ad's `budget_remaining`
6. User periodically runs "CodeSlot: Redeem Credits" command → webview prompts for OpenRouter linking → `/redeem-credits` called

## 4. Hosting & Infra

- **Database + Auth (if needed later)**: Supabase (Postgres + Edge Functions)
- **Cache/Queue**: Upstash Redis (serverless, pay-per-request, no idle cost)
- **Extension distribution**: VS Code Marketplace
- **No standalone backend server** — fully serverless, scales to zero, no idle-monitor hacks needed (avoids the Render.com issue from ScrollAR)

## 5. Scaling Considerations (Post-MVP)

- If event volume grows, batch `/track-event` calls client-side (send every N minutes instead of per-event) to reduce edge function invocations
- Move ad rotation logic fully into Redis with weighted lottery algorithm for fairness across advertiser budgets
- Consider Cloudflare Workers if Supabase Edge Function cold-starts become noticeable (unlikely at MVP scale)
