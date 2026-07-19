-- OrzuVideo pro dashboard extensions

-- Expand AI training
alter table public.ai_training
  add column if not exists video_format text not null default 'shorts',
  add column if not exists video_style text not null default 'cinematic_mixer',
  add column if not exists reply_comments_enabled boolean not null default false,
  add column if not exists reply_languages text not null default 'auto',
  add column if not exists reply_style_prompt text not null default 'Friendly, short, on-brand. Never argue. Invite to watch next Short.',
  add column if not exists learning_enabled boolean not null default true,
  add column if not exists brand_rules text default '';

-- Publish schedule
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

create trigger publish_schedules_updated_at
  before update on public.publish_schedules
  for each row execute function public.set_updated_at();

-- Usage / cost tracking
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

-- AI self-learning memory (comments, outcomes)
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

-- Comment reply queue / log
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

-- Enrich video_jobs for content management
alter table public.video_jobs
  add column if not exists thumbnail_url text,
  add column if not exists view_count int default 0,
  add column if not exists like_count int default 0,
  add column if not exists comment_count int default 0,
  add column if not exists duration_seconds int,
  add column if not exists preview_url text;

-- Channel cache on profile
alter table public.profiles
  add column if not exists youtube_subscriber_count int default 0,
  add column if not exists youtube_view_count bigint default 0,
  add column if not exists youtube_video_count int default 0,
  add column if not exists youtube_thumbnail_url text,
  add column if not exists youtube_custom_url text,
  add column if not exists youtube_stats_synced_at timestamptz;

-- RLS
alter table public.publish_schedules enable row level security;
alter table public.usage_events enable row level security;
alter table public.ai_learning_memory enable row level security;
alter table public.comment_replies enable row level security;

create policy "Users manage own schedules"
  on public.publish_schedules for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users read own usage"
  on public.usage_events for select
  using (auth.uid() = user_id);

create policy "Users manage own learning"
  on public.ai_learning_memory for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own comment replies"
  on public.comment_replies for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
