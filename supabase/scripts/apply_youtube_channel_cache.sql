-- Apply YouTube channel cache columns (banner + like/comment totals).
alter table public.youtube_channels
  add column if not exists banner_url text,
  add column if not exists like_count bigint default 0,
  add column if not exists comment_count bigint default 0;

alter table public.profiles
  add column if not exists youtube_banner_url text,
  add column if not exists youtube_like_count bigint default 0,
  add column if not exists youtube_comment_count bigint default 0;
