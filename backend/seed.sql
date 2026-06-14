-- Seed 3–5 test ads (ROADMAP Phase 1). URLs are reviewed manually before
-- insertion (SECURITY §7); only https links here.
insert into ads (advertiser_name, text, url, description, brand_color, logo_url, weight, budget_remaining)
values
  ('Vercel',   'Vercel — Deploy in seconds →',                'https://vercel.com',   'Ship frontend apps with zero config.',            '#ffffff', 'https://assets.vercel.com/image/upload/front/favicon/vercel/57x57.png', 3, 100),
  ('Supabase', 'Supabase — Open source Firebase alternative', 'https://supabase.com', 'Postgres, auth, and realtime. Free tier forever.', '#3ecf8e', 'https://supabase.com/favicon/favicon-48x48.png',                       2, 100),
  ('Snyk',     'Snyk — Find and fix vulnerabilities',         'https://snyk.io',      'Developer-first security for your dependencies.',  '#4c4a73', 'https://snyk.io/favicon-32x32.png',                                     1, 100),
  ('Warp',     'Warp — The 21st century terminal',            'https://warp.dev',     'A faster, smarter terminal with AI built in.',     '#01a4ff', 'https://www.warp.dev/favicon-32x32.png',                                1, 100)
on conflict do nothing;
