-- Own music library (Cloudflare R2 files + Postgres metadata)
-- Replaces Jamendo for Media + worker background music.

create table if not exists public.music_genres (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  unique (user_id, slug)
);

create index if not exists music_genres_user_idx
  on public.music_genres (user_id, created_at desc);

create table if not exists public.music_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  genre_id uuid not null references public.music_genres(id) on delete cascade,
  title text not null,
  artist text not null default '',
  mood text not null default '',
  duration_sec integer,
  storage_path text not null,
  storage_bucket text not null default 'orzu-media',
  public_url text,
  created_at timestamptz not null default now()
);

create index if not exists music_tracks_user_idx
  on public.music_tracks (user_id, created_at desc);

create index if not exists music_tracks_genre_idx
  on public.music_tracks (genre_id);

create index if not exists music_tracks_mood_idx
  on public.music_tracks (user_id, mood);

alter table public.music_genres enable row level security;
alter table public.music_tracks enable row level security;

drop policy if exists "Users manage own music genres" on public.music_genres;
create policy "Users manage own music genres"
  on public.music_genres for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage own music tracks" on public.music_tracks;
create policy "Users manage own music tracks"
  on public.music_tracks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Allow media_usage to record library track IDs
alter table public.media_usage drop constraint if exists media_usage_provider_check;
alter table public.media_usage
  add constraint media_usage_provider_check
  check (provider in ('pexels', 'jamendo', 'heygen', 'topic', 'library'));
