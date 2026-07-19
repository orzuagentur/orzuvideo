-- OrzuVideo MVP schema
-- Run in Supabase SQL Editor or via supabase db push

create extension if not exists "pgcrypto";

-- Profiles (1:1 with auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  youtube_channel_id text,
  youtube_channel_title text,
  youtube_refresh_token text,
  youtube_access_token text,
  youtube_token_expires_at timestamptz,
  youtube_connected boolean not null default false,
  daily_videos_enabled boolean not null default false,
  videos_per_day int not null default 2 check (videos_per_day between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One-time AI training / brand voice
create table if not exists public.ai_training (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade unique,
  niche text not null default 'motivation',
  content_type text not null default 'motivational_quotes',
  style_prompt text not null,
  tone text not null default 'powerful',
  language text not null default 'en',
  target_audience text,
  hook_style text default 'bold opening question',
  cta text default 'Follow for daily motivation',
  pexels_query text not null default 'man walking cinematic',
  music_mood text not null default 'cinematic motivational',
  voice_id text default 'default',
  subtitle_style text not null default 'karaoke_bold',
  duration_seconds int not null default 45 check (duration_seconds between 20 and 59),
  is_trained boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Job queue for video generation + publish
create type public.job_status as enum (
  'queued',
  'generating_script',
  'generating_voice',
  'fetching_media',
  'editing',
  'uploading',
  'published',
  'failed'
);

create table if not exists public.video_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.job_status not null default 'queued',
  scheduled_for timestamptz not null default now(),
  script_text text,
  title text,
  description text,
  tags text[] default '{}',
  voice_path text,
  video_path text,
  youtube_video_id text,
  youtube_url text,
  error_message text,
  attempt_count int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists video_jobs_status_idx on public.video_jobs(status, scheduled_for);
create index if not exists video_jobs_user_idx on public.video_jobs(user_id, created_at desc);

-- Published history (denormalized for dashboard)
create table if not exists public.published_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid references public.video_jobs(id) on delete set null,
  youtube_video_id text not null,
  youtube_url text,
  title text,
  script_text text,
  published_at timestamptz not null default now()
);

create index if not exists published_videos_user_idx on public.published_videos(user_id, published_at desc);

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger ai_training_updated_at
  before update on public.ai_training
  for each row execute function public.set_updated_at();

create trigger video_jobs_updated_at
  before update on public.video_jobs
  for each row execute function public.set_updated_at();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.ai_training enable row level security;
alter table public.video_jobs enable row level security;
alter table public.published_videos enable row level security;

create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users manage own training"
  on public.ai_training for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users read own jobs"
  on public.video_jobs for select
  using (auth.uid() = user_id);

create policy "Users insert own jobs"
  on public.video_jobs for insert
  with check (auth.uid() = user_id);

create policy "Users read own published"
  on public.published_videos for select
  using (auth.uid() = user_id);

-- Service role bypasses RLS for worker
