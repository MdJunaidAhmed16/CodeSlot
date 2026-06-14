# CodeSlot Admin Dashboard

Standalone web console (Vite + React + TypeScript) for managing campaigns and
watching platform metrics. It talks only to the admin Edge Functions — it never
touches the database directly.

## What it does

- **Overview**: total spend, impressions, clicks, CTR, developer payout, and
  platform margin; plus the global **ad-serving kill switch**.
- **Campaigns**: list ads with live metrics, pause/resume, and create new
  campaigns (advertiser, copy, URL, brand color, logo, weight, budget).

## Auth

Admins sign in with GitHub. Access requires `users.is_admin = true` in the
backend — enforced server-side on every admin endpoint.

- **Production**: configure the GitHub provider in Supabase Auth and set
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. The app uses Supabase's GitHub
  OAuth, then exchanges the GitHub token at `/auth` for a CodeSlot session.
- **Local/dev**: leave the Supabase vars blank to use the dev sign-in against
  the mock backend (`npm run mock` in the repo root).

## Run

```bash
cp .env.example .env       # set VITE_API_BASE_URL (and Supabase vars in prod)
npm install
npm run dev                # http://localhost:5173
npm run build              # static build → dist/ (deploy to Vercel/Netlify)
```

To try it locally end-to-end: start the mock backend (`npm run mock` from the
repo root), then `npm run dev` here and click **Sign in (dev)** — the mock
grants an admin session so you can see metrics, create ads, and flip the kill
switch.
