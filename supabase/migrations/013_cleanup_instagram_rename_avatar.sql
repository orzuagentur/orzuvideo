-- Remove Instagram connection junk; rename Avatar tables away from Instagram naming.
-- Run in Supabase SQL Editor on the OrzuVideo project.

-- 1) Drop unused Instagram OAuth / projects tables
drop table if exists public.instagram_accounts cascade;
drop table if exists public.creator_projects cascade;

-- 2) Rename avatar training / jobs (keep data)
do $$
begin
  if to_regclass('public.instagram_training') is not null
     and to_regclass('public.avatar_training') is null then
    alter table public.instagram_training rename to avatar_training;
  end if;

  if to_regclass('public.instagram_jobs') is not null
     and to_regclass('public.avatar_jobs') is null then
    alter table public.instagram_jobs rename to avatar_jobs;
  end if;
end $$;

-- 3) Drop Instagram publish leftover columns (only if avatar_jobs exists)
do $$
begin
  if to_regclass('public.avatar_jobs') is not null then
    alter table public.avatar_jobs
      drop column if exists instagram_media_id,
      drop column if exists instagram_permalink;
  end if;
end $$;

-- 4) Rename enum type if still named ig_job_status
do $$
begin
  if exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
             where n.nspname = 'public' and t.typname = 'ig_job_status')
     and not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                     where n.nspname = 'public' and t.typname = 'avatar_job_status') then
    alter type public.ig_job_status rename to avatar_job_status;
  end if;
end $$;

-- 5) Indexes / triggers / policies (best-effort, only when tables exist)
do $$
begin
  if to_regclass('public.avatar_jobs') is not null then
    begin
      alter index if exists public.instagram_jobs_user_created_idx
        rename to avatar_jobs_user_created_idx;
    exception when others then null;
    end;
    begin
      alter index if exists public.instagram_jobs_queue_idx
        rename to avatar_jobs_queue_idx;
    exception when others then null;
    end;
  end if;
end $$;

do $$
begin
  if to_regclass('public.avatar_training') is not null then
    drop trigger if exists instagram_training_updated_at on public.avatar_training;
    drop trigger if exists avatar_training_updated_at on public.avatar_training;
    create trigger avatar_training_updated_at
      before update on public.avatar_training
      for each row execute function public.set_updated_at();

    drop policy if exists "Users manage own ig training" on public.avatar_training;
    drop policy if exists "Users manage own avatar training" on public.avatar_training;
    create policy "Users manage own avatar training"
      on public.avatar_training for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if to_regclass('public.avatar_jobs') is not null then
    drop trigger if exists instagram_jobs_updated_at on public.avatar_jobs;
    drop trigger if exists avatar_jobs_updated_at on public.avatar_jobs;
    create trigger avatar_jobs_updated_at
      before update on public.avatar_jobs
      for each row execute function public.set_updated_at();

    drop policy if exists "Users manage own ig jobs" on public.avatar_jobs;
    drop policy if exists "Users manage own avatar jobs" on public.avatar_jobs;
    create policy "Users manage own avatar jobs"
      on public.avatar_jobs for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
