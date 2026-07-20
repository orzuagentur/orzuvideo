-- Multi YouTube channels per user + per-channel training/jobs/schedule

create table if not exists public.youtube_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel_id text not null,
  title text,
  custom_url text,
  thumbnail_url text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  subscriber_count int default 0,
  view_count bigint default 0,
  video_count int default 0,
  stats_synced_at timestamptz,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, channel_id)
);

create index if not exists youtube_channels_user_active_idx
  on public.youtube_channels (user_id, is_active);

drop trigger if exists youtube_channels_updated_at on public.youtube_channels;
create trigger youtube_channels_updated_at
  before update on public.youtube_channels
  for each row execute function public.set_updated_at();

alter table public.youtube_channels enable row level security;

drop policy if exists "Users manage own yt channels" on public.youtube_channels;
create policy "Users manage own yt channels"
  on public.youtube_channels for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Link jobs / training / schedule / montage to a YouTube channel_id (YT API id)
alter table public.video_jobs
  add column if not exists youtube_channel_id text;

create index if not exists video_jobs_user_channel_idx
  on public.video_jobs (user_id, youtube_channel_id, created_at desc);

alter table public.ai_training
  add column if not exists youtube_channel_id text;

alter table public.publish_schedules
  add column if not exists youtube_channel_id text;

alter table public.montage_settings
  add column if not exists youtube_channel_id text;

-- Migrate: drop single-user unique, use (user_id, youtube_channel_id)
alter table public.ai_training drop constraint if exists ai_training_user_id_key;
alter table public.publish_schedules drop constraint if exists publish_schedules_user_id_key;
alter table public.montage_settings drop constraint if exists montage_settings_pkey;

-- Allow multiple training rows per user (one per channel). Keep nullable channel for legacy.
create unique index if not exists ai_training_user_channel_uidx
  on public.ai_training (user_id, coalesce(youtube_channel_id, ''));

create unique index if not exists publish_schedules_user_channel_uidx
  on public.publish_schedules (user_id, coalesce(youtube_channel_id, ''));

-- montage_settings was PK on user_id — rebuild
alter table public.montage_settings
  add column if not exists id uuid default gen_random_uuid();

update public.montage_settings set id = gen_random_uuid() where id is null;

do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_name = 'montage_settings' and constraint_type = 'PRIMARY KEY'
  ) then
    alter table public.montage_settings drop constraint montage_settings_pkey;
  end if;
exception when others then null;
end $$;

alter table public.montage_settings
  alter column id set not null;

alter table public.montage_settings
  add primary key (id);

create unique index if not exists montage_settings_user_channel_uidx
  on public.montage_settings (user_id, coalesce(youtube_channel_id, ''));

-- Seed youtube_channels from existing profiles
insert into public.youtube_channels (
  user_id, channel_id, title, custom_url, thumbnail_url,
  access_token, refresh_token, token_expires_at,
  subscriber_count, view_count, video_count, stats_synced_at, is_active
)
select
  p.id,
  p.youtube_channel_id,
  p.youtube_channel_title,
  p.youtube_custom_url,
  p.youtube_thumbnail_url,
  p.youtube_access_token,
  p.youtube_refresh_token,
  p.youtube_token_expires_at,
  coalesce(p.youtube_subscriber_count, 0),
  coalesce(p.youtube_view_count, 0),
  coalesce(p.youtube_video_count, 0),
  p.youtube_stats_synced_at,
  true
from public.profiles p
where p.youtube_channel_id is not null
on conflict (user_id, channel_id) do update set
  title = excluded.title,
  is_active = true,
  access_token = coalesce(excluded.access_token, public.youtube_channels.access_token),
  refresh_token = coalesce(excluded.refresh_token, public.youtube_channels.refresh_token);

-- Backfill channel id on existing rows
update public.video_jobs j
set youtube_channel_id = p.youtube_channel_id
from public.profiles p
where j.user_id = p.id
  and j.youtube_channel_id is null
  and p.youtube_channel_id is not null;

update public.ai_training t
set youtube_channel_id = p.youtube_channel_id
from public.profiles p
where t.user_id = p.id
  and t.youtube_channel_id is null
  and p.youtube_channel_id is not null;

update public.publish_schedules s
set youtube_channel_id = p.youtube_channel_id
from public.profiles p
where s.user_id = p.id
  and s.youtube_channel_id is null
  and p.youtube_channel_id is not null;

comment on table public.youtube_channels is
  'Connected YouTube channels; one active per user drives training/content/worker scope';
