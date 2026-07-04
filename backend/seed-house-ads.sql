-- House / affiliate ads -------------------------------------------------------
-- Platform-funded promos that fill the FREE_SLOTS base so the slot is never
-- empty before advertisers arrive. They are is_house = true, so they do NOT
-- count toward the advertiser-funding capacity sum.
--
-- Economics: reward_per_impression = 2 credits ($0.002) and the matching
-- cost_per_impression = 0.002 means each impression spends $0.002 of
-- budget_remaining. So budget_remaining is the HARD SUBSIDY CAP — when it hits
-- 0 the house ad stops serving automatically. $5 each × 5 ads = $25 max subsidy.
--
-- TODO: replace each `url` with your affiliate / referral link so clicks earn
-- real revenue and the house ads become (near) cost-neutral.
--
-- Idempotent: only inserts a house ad whose advertiser_name isn't already
-- present, so re-running won't duplicate rows or reset spent budgets.
insert into ads
  (advertiser_id, advertiser_name, text, url, description, is_house,
   billing_model, budget_remaining, cost_per_impression, reward_per_impression,
   cost_per_click, reward_per_click, status, active, weight)
select v.* from (values
  (null::uuid, 'Vercel',   'Vercel - ship frontend apps with zero config',
     'https://vercel.com/',           'Deploy in seconds.',                       true, 'cpm', 5::numeric, 0.002::numeric, 2::numeric, 0::numeric, 0::numeric, 'approved', true, 1),
  (null::uuid, 'Supabase', 'Supabase - the open source Firebase alternative',
     'https://supabase.com/',         'Postgres, auth, storage, edge functions.', true, 'cpm', 5::numeric, 0.002::numeric, 2::numeric, 0::numeric, 0::numeric, 'approved', true, 1),
  (null::uuid, 'Gemini',   'Google Gemini - build with the Gemini API',
     'https://ai.google.dev/',        'Multimodal models for your apps.',         true, 'cpm', 5::numeric, 0.002::numeric, 2::numeric, 0::numeric, 0::numeric, 'approved', true, 1),
  (null::uuid, 'GitHub Copilot', 'GitHub Copilot - your AI pair programmer',
     'https://github.com/features/copilot', 'Code faster with AI in your editor.', true, 'cpm', 5::numeric, 0.002::numeric, 2::numeric, 0::numeric, 0::numeric, 'approved', true, 1),
  (null::uuid, 'Warp',     'Warp - the 21st century terminal',
     'https://www.warp.dev/',         'A modern, AI-powered terminal.',           true, 'cpm', 5::numeric, 0.002::numeric, 2::numeric, 0::numeric, 0::numeric, 'approved', true, 1)
) as v(advertiser_id, advertiser_name, text, url, description, is_house,
       billing_model, budget_remaining, cost_per_impression, reward_per_impression,
       cost_per_click, reward_per_click, status, active, weight)
where not exists (
  select 1 from ads a where a.is_house = true and a.advertiser_name = v.advertiser_name
);
