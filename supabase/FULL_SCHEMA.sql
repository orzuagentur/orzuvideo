-- OrzuVideo FULL SCHEMA (run once in Supabase SQL Editor)
-- Safe to re-run: uses IF NOT EXISTS / DROP IF EXISTS where needed

create extension if not exists "pgcrypto";

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

-- Profiles
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
  youtube_subscriber_count int default 0,
  youtube_view_count bigint default 0,
  youtube_video_count int default 0,
  youtube_thumbnail_url text,
  youtube_custom_url text,
  youtube_stats_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists youtube_subscriber_count int default 0,
  add column if not exists youtube_view_count bigint default 0,
  add column if not exists youtube_video_count int default 0,
  add column if not exists youtube_thumbnail_url text,
  add column if not exists youtube_custom_url text,
  add column if not exists youtube_stats_synced_at timestamptz;

-- AI training
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
  video_format text not null default 'shorts',
  video_style text not null default 'cinematic_mixer',
  reply_comments_enabled boolean not null default false,
  reply_languages text not null default 'auto',
  reply_style_prompt text not null default 'Friendly, short, on-brand. Never argue. Invite to watch next Short.',
  learning_enabled boolean not null default true,
  brand_rules text default '',
  is_trained boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_training
  add column if not exists video_format text not null default 'shorts',
  add column if not exists video_style text not null default 'cinematic_mixer',
  add column if not exists reply_comments_enabled boolean not null default false,
  add column if not exists reply_languages text not null default 'auto',
  add column if not exists reply_style_prompt text not null default 'Friendly, short, on-brand. Never argue. Invite to watch next Short.',
  add column if not exists learning_enabled boolean not null default true,
  add column if not exists brand_rules text default '';

-- Job status enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'job_status') then
    create type public.job_status as enum (
      'queued',
      'generating_script',
      'generating_voice',
      'fetching_media',
      'editing',
      'uploading',
      'ready',
      'published',
      'failed'
    );
  end if;
end $$;

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
  thumbnail_url text,
  view_count int default 0,
  like_count int default 0,
  comment_count int default 0,
  duration_seconds int,
  preview_url text,
  storage_path text,
  storage_bucket text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.video_jobs
  add column if not exists thumbnail_url text,
  add column if not exists view_count int default 0,
  add column if not exists like_count int default 0,
  add column if not exists comment_count int default 0,
  add column if not exists duration_seconds int,
  add column if not exists preview_url text,
  add column if not exists storage_path text,
  add column if not exists storage_bucket text;

create index if not exists video_jobs_status_idx on public.video_jobs(status, scheduled_for);
create index if not exists video_jobs_user_idx on public.video_jobs(user_id, created_at desc);

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

create table if not exists public.publish_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade unique,
  enabled boolean not null default false,
  mode text not null default 'daily' check (mode in ('daily', 'weekdays', 'custom_days', 'dates')),
  videos_per_day int not null default 2 check (videos_per_day between 1 and 10),
  times text[] not null default array['09:00','18:00'],
  weekdays int[] not null default array[1,2,3,4,5,6,7],
  custom_dates date[] not null default '{}',
  timezone text not null default 'Europe/Berlin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid references public.video_jobs(id) on delete set null,
  provider text not null check (provider in ('openai', 'elevenlabs', 'jamendo', 'youtube', 'pexels', 'other')),
  kind text not null default 'api_call',
  units numeric not null default 0,
  unit_label text not null default 'tokens',
  cost_usd numeric not null default 0,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_user_idx on public.usage_events(user_id, created_at desc);
create index if not exists usage_events_provider_idx on public.usage_events(user_id, provider);

create table if not exists public.ai_learning_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null check (source in ('comment_reply', 'publish_result', 'manual', 'training')),
  input_text text not null,
  output_text text,
  language text,
  feedback text check (feedback is null or feedback in ('positive', 'negative', 'neutral')),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_learning_user_idx on public.ai_learning_memory(user_id, created_at desc);

create table if not exists public.comment_replies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  youtube_video_id text not null,
  youtube_comment_id text not null,
  comment_text text not null,
  comment_author text,
  reply_text text,
  status text not null default 'pending' check (status in ('pending', 'replied', 'skipped', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  replied_at timestamptz,
  unique (youtube_comment_id)
);

create index if not exists comment_replies_user_idx on public.comment_replies(user_id, created_at desc);

-- Triggers
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists ai_training_updated_at on public.ai_training;
create trigger ai_training_updated_at
  before update on public.ai_training
  for each row execute function public.set_updated_at();

drop trigger if exists video_jobs_updated_at on public.video_jobs;
create trigger video_jobs_updated_at
  before update on public.video_jobs
  for each row execute function public.set_updated_at();

drop trigger if exists publish_schedules_updated_at on public.publish_schedules;
create trigger publish_schedules_updated_at
  before update on public.publish_schedules
  for each row execute function public.set_updated_at();

-- Auto profile on signup
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
  )
  on conflict (id) do nothing;
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
alter table public.publish_schedules enable row level security;
alter table public.usage_events enable row level security;
alter table public.ai_learning_memory enable row level security;
alter table public.comment_replies enable row level security;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "Users manage own training" on public.ai_training;
create policy "Users manage own training"
  on public.ai_training for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users read own jobs" on public.video_jobs;
create policy "Users read own jobs"
  on public.video_jobs for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own jobs" on public.video_jobs;
create policy "Users insert own jobs"
  on public.video_jobs for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own jobs" on public.video_jobs;
create policy "Users update own jobs"
  on public.video_jobs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own jobs" on public.video_jobs;
create policy "Users delete own jobs"
  on public.video_jobs for delete
  using (auth.uid() = user_id);

drop policy if exists "Users read own published" on public.published_videos;
create policy "Users read own published"
  on public.published_videos for select
  using (auth.uid() = user_id);

drop policy if exists "Users manage own schedules" on public.publish_schedules;
create policy "Users manage own schedules"
  on public.publish_schedules for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users read own usage" on public.usage_events;
create policy "Users read own usage"
  on public.usage_events for select
  using (auth.uid() = user_id);

drop policy if exists "Users manage own learning" on public.ai_learning_memory;
create policy "Users manage own learning"
  on public.ai_learning_memory for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage own comment replies" on public.comment_replies;
create policy "Users manage own comment replies"
  on public.comment_replies for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Ready = edited Short waiting for manual YouTube publish
do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'job_status' and e.enumlabel = 'ready'
  ) then
    alter type public.job_status add value 'ready';
  end if;
end $$;

-- Worker heartbeat for dashboard Worker panel
create table if not exists public.worker_presence (
  id text primary key default 'main',
  last_seen_at timestamptz not null default now(),
  hostname text,
  meta jsonb not null default '{}'::jsonb
);

alter table public.worker_presence enable row level security;

drop policy if exists "Authenticated read worker presence" on public.worker_presence;
create policy "Authenticated read worker presence"
  on public.worker_presence for select
  to authenticated
  using (true);

-- ===== Multi-platform: Projects + Instagram + HeyGen fields =====
-- See also: migrations/005_projects_instagram_heygen.sql

-- Multi-platform projects + Instagram space + HeyGen avatar fields
-- YouTube tables stay untouched; Instagram is a separate clean surface.

create table if not exists public.creator_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'instagram')),
  name text not null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform)
);

drop trigger if exists creator_projects_updated_at on public.creator_projects;
create trigger creator_projects_updated_at
  before update on public.creator_projects
  for each row execute function public.set_updated_at();

alter table public.creator_projects enable row level security;

drop policy if exists "Users manage own projects" on public.creator_projects;
create policy "Users manage own projects"
  on public.creator_projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Seed YouTube + Instagram project rows for existing users
insert into public.creator_projects (user_id, platform, name)
select p.id, 'youtube', 'YouTube Shorts'
from public.profiles p
on conflict (user_id, platform) do nothing;

insert into public.creator_projects (user_id, platform, name)
select p.id, 'instagram', 'Instagram Reels'
from public.profiles p
on conflict (user_id, platform) do nothing;

-- Instagram account connection (Meta later)
create table if not exists public.instagram_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  connected boolean not null default false,
  ig_user_id text,
  username text,
  name text,
  profile_picture_url text,
  access_token text,
  token_expires_at timestamptz,
  followers_count int default 0,
  media_count int default 0,
  stats_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists instagram_accounts_updated_at on public.instagram_accounts;
create trigger instagram_accounts_updated_at
  before update on public.instagram_accounts
  for each row execute function public.set_updated_at();

alter table public.instagram_accounts enable row level security;

drop policy if exists "Users manage own ig account" on public.instagram_accounts;
create policy "Users manage own ig account"
  on public.instagram_accounts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Meta Facebook Login → Instagram Business (migration 006)
alter table public.instagram_accounts
  add column if not exists facebook_page_id text,
  add column if not exists facebook_page_name text,
  add column if not exists page_access_token text,
  add column if not exists token_type text default 'page',
  add column if not exists refresh_token text;

-- Instagram AI training + HeyGen avatar (separate from YouTube ai_training)
create table if not exists public.instagram_training (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  niche text not null default 'lifestyle',
  content_type text not null default 'reels_talking_head',
  style_prompt text not null default '',
  tone text not null default 'friendly',
  language text not null default 'en',
  target_audience text default '',
  hook_style text default 'bold opening',
  cta text default 'Follow for more',
  music_mood text not null default 'upbeat',
  voice_id text default '21m00Tcm4TlvDq8ikWAM',
  duration_seconds int not null default 30,
  brand_rules text default '',
  -- HeyGen
  visual_mode text not null default 'heygen' check (visual_mode in ('heygen', 'stock')),
  heygen_avatar_id text,
  heygen_avatar_name text,
  heygen_background_mode text not null default 'rotate'
    check (heygen_background_mode in ('fixed', 'rotate', 'none')),
  heygen_background_url text,
  avatar_image_url text,
  is_trained boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists instagram_training_updated_at on public.instagram_training;
create trigger instagram_training_updated_at
  before update on public.instagram_training
  for each row execute function public.set_updated_at();

alter table public.instagram_training enable row level security;

drop policy if exists "Users manage own ig training" on public.instagram_training;
create policy "Users manage own ig training"
  on public.instagram_training for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Instagram content jobs (separate queue from video_jobs)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ig_job_status') then
    create type public.ig_job_status as enum (
      'queued',
      'generating_script',
      'generating_voice',
      'generating_avatar',
      'editing',
      'uploading',
      'ready',
      'published',
      'failed'
    );
  end if;
end $$;

create table if not exists public.instagram_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.ig_job_status not null default 'queued',
  scheduled_for timestamptz not null default now(),
  script_text text,
  title text,
  caption text,
  tags text[] default '{}',
  voice_path text,
  video_path text,
  preview_url text,
  thumbnail_url text,
  instagram_media_id text,
  instagram_permalink text,
  error_message text,
  attempt_count int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  view_count bigint default 0,
  like_count int default 0,
  comment_count int default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists instagram_jobs_user_created_idx
  on public.instagram_jobs (user_id, created_at desc);
create index if not exists instagram_jobs_queue_idx
  on public.instagram_jobs (status, scheduled_for);

drop trigger if exists instagram_jobs_updated_at on public.instagram_jobs;
create trigger instagram_jobs_updated_at
  before update on public.instagram_jobs
  for each row execute function public.set_updated_at();

alter table public.instagram_jobs enable row level security;

drop policy if exists "Users manage own ig jobs" on public.instagram_jobs;
create policy "Users manage own ig jobs"
  on public.instagram_jobs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Optional HeyGen fields on YouTube training (for later; does not change current YT pipeline)
alter table public.ai_training
  add column if not exists visual_mode text default 'stock',
  add column if not exists heygen_avatar_id text,
  add column if not exists heygen_avatar_name text;

-- media_usage + montage_settings (migration 007)
create table if not exists public.media_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('pexels', 'jamendo', 'heygen', 'topic')),
  asset_id text not null,
  job_id uuid,
  title text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, provider, asset_id)
);

create index if not exists media_usage_user_provider_idx
  on public.media_usage (user_id, provider, created_at desc);

alter table public.media_usage enable row level security;

drop policy if exists "Users manage own media usage" on public.media_usage;
create policy "Users manage own media usage"
  on public.media_usage for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.montage_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  clip_count int not null default 5 check (clip_count between 3 and 8),
  music_mood text not null default 'motivational epic',
  music_volume_hook numeric not null default 0.88,
  music_volume_body numeric not null default 0.58,
  voice_volume numeric not null default 1.05,
  transitions_enabled boolean not null default true,
  motions_enabled boolean not null default true,
  punch_first_clip boolean not null default true,
  enabled_transitions text[] not null default array[
    'fade','wipeleft','wiperight','slideleft','slideright',
    'circleopen','dissolve','radial','smoothleft','diagtl'
  ],
  enabled_motions text[] not null default array[
    'punch_in','slow_push','rise','drift_left','drift_right','snap_zoom'
  ],
  avoid_reuse_days int not null default 60,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

drop trigger if exists montage_settings_updated_at on public.montage_settings;
create trigger montage_settings_updated_at
  before update on public.montage_settings
  for each row execute function public.set_updated_at();

alter table public.montage_settings enable row level security;

drop policy if exists "Users manage own montage" on public.montage_settings;
create policy "Users manage own montage"
  on public.montage_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
