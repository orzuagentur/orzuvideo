-- Track used Pexels / Jamendo assets so worker never reuses them across videos
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

-- Montage preferences (YouTube Shorts worker tools)
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
