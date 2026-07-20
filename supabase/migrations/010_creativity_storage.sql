-- Creativity / platform videos: Supabase Storage architecture
-- MP4 files live in bucket short-previews at {user_id}/{job_id}.mp4
-- video_jobs.preview_url + storage_path point at that object

alter table public.video_jobs
  add column if not exists storage_path text,
  add column if not exists storage_bucket text;

comment on column public.video_jobs.storage_path is
  'Object key in Supabase Storage, e.g. {user_id}/{job_id}.mp4';
comment on column public.video_jobs.storage_bucket is
  'Storage bucket id (default short-previews)';

-- Public playback bucket (browser <video> + signed URL fallback)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'short-previews',
  'short-previews',
  true,
  104857600, -- 100 MB
  array['video/mp4', 'video/quicktime', 'video/webm']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Optional audio bucket used by Instagram / HeyGen path
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ig-audio',
  'ig-audio',
  true,
  52428800, -- 50 MB
  array['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Read: anyone can read public bucket objects (needed for <video src>)
drop policy if exists "Public read short-previews" on storage.objects;
create policy "Public read short-previews"
  on storage.objects for select
  to public
  using (bucket_id = 'short-previews');

drop policy if exists "Public read ig-audio" on storage.objects;
create policy "Public read ig-audio"
  on storage.objects for select
  to public
  using (bucket_id = 'ig-audio');

-- Writes: service role bypasses RLS; also allow authenticated insert into own folder
-- (worker uses service role; this keeps the door open for future client uploads)
drop policy if exists "Users upload own short-previews" on storage.objects;
create policy "Users upload own short-previews"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'short-previews'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users update own short-previews" on storage.objects;
create policy "Users update own short-previews"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'short-previews'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'short-previews'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users delete own short-previews" on storage.objects;
create policy "Users delete own short-previews"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'short-previews'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
