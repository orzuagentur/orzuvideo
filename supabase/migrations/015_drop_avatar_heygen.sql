-- Remove Avatar / HeyGen / leftover Instagram avatar tables from OrzuAi.
-- Safe to re-run.

-- Jobs + training (new names after 013, or old Instagram names)
drop table if exists public.avatar_jobs cascade;
drop table if exists public.avatar_training cascade;
drop table if exists public.instagram_jobs cascade;
drop table if exists public.instagram_training cascade;
drop table if exists public.instagram_accounts cascade;

-- Enums if present
do $$ begin
  drop type if exists public.avatar_job_status;
exception when others then null;
end $$;

do $$ begin
  drop type if exists public.ig_job_status;
exception when others then null;
end $$;

-- Optional HeyGen columns on YouTube AI training (unused by YT pipeline)
alter table public.ai_training
  drop column if exists heygen_avatar_id,
  drop column if exists heygen_avatar_name;

-- Creator projects table if still around
drop table if exists public.creator_projects cascade;

-- Optional: remove unused HeyGen audio bucket (ignore errors if missing)
do $$ begin
  delete from storage.objects where bucket_id = 'ig-audio';
  delete from storage.buckets where id = 'ig-audio';
exception when others then null;
end $$;
