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
