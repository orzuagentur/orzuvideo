-- Platform-wide music library (managed in admin/, used by all video jobs).

alter table public.music_genres
  add column if not exists is_platform boolean not null default false;

alter table public.music_tracks
  add column if not exists is_platform boolean not null default false;

-- Existing library becomes the shared platform catalog
update public.music_genres set is_platform = true where is_platform = false;
update public.music_tracks set is_platform = true where is_platform = false;

create index if not exists music_genres_platform_idx
  on public.music_genres (is_platform, name)
  where is_platform = true;

create index if not exists music_tracks_platform_idx
  on public.music_tracks (is_platform, created_at desc)
  where is_platform = true;

-- Read: own rows OR platform catalog. Writes stay owner-only (admin uses service role).
drop policy if exists "Users manage own music genres" on public.music_genres;
drop policy if exists "Users manage own music tracks" on public.music_tracks;
drop policy if exists "Users read platform or own music genres" on public.music_genres;
drop policy if exists "Users write own music genres" on public.music_genres;
drop policy if exists "Users read platform or own music tracks" on public.music_tracks;
drop policy if exists "Users write own music tracks" on public.music_tracks;

create policy "Users read platform or own music genres"
  on public.music_genres for select
  using (is_platform = true or auth.uid() = user_id);

create policy "Users write own music genres"
  on public.music_genres for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users read platform or own music tracks"
  on public.music_tracks for select
  using (is_platform = true or auth.uid() = user_id);

create policy "Users write own music tracks"
  on public.music_tracks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on column public.music_genres.is_platform is
  'Shared catalog managed by admin; used for all platform video generation.';
comment on column public.music_tracks.is_platform is
  'Shared catalog managed by admin; used for all platform video generation.';
