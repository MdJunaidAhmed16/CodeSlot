-- CodeSlot - Supabase Storage setup for advertiser logos.
-- Run once (SQL editor) alongside schema.sql.

-- Public bucket for ad logos (small images; served via public URL in the slot).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ad-logos', 'ad-logos', true,
  524288,  -- 512 KB max
  array['image/png','image/jpeg','image/webp','image/svg+xml']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 524288,
  allowed_mime_types = array['image/png','image/jpeg','image/webp','image/svg+xml'];

-- Authenticated advertisers may upload; everyone may read (bucket is public).
drop policy if exists "advertisers upload logos" on storage.objects;
create policy "advertisers upload logos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'ad-logos');

drop policy if exists "public read logos" on storage.objects;
create policy "public read logos" on storage.objects
  for select using (bucket_id = 'ad-logos');
