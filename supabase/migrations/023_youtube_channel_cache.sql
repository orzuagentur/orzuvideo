-- Cache YouTube channel banner + engagement totals (likes/comments).
-- stats_synced_at already exists — used as 24h cache watermark.

alter table public.youtube_channels
  add column if not exists banner_url text,
  add column if not exists like_count bigint default 0,
  add column if not exists comment_count bigint default 0;

alter table public.profiles
  add column if not exists youtube_banner_url text,
  add column if not exists youtube_like_count bigint default 0,
  add column if not exists youtube_comment_count bigint default 0;

comment on column public.youtube_channels.banner_url is
  'Cached channel banner URL from YouTube brandingSettings';
comment on column public.youtube_channels.stats_synced_at is
  'Last full YouTube sync; UI auto-refreshes at most once per 24h';
