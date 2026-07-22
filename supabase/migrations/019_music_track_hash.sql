-- Dedup + size for music library uploads
alter table public.music_tracks
  add column if not exists file_hash text,
  add column if not exists file_size_bytes bigint;

create unique index if not exists music_tracks_user_hash_uidx
  on public.music_tracks (user_id, file_hash)
  where file_hash is not null and file_hash <> '';

create index if not exists music_tracks_genre_size_idx
  on public.music_tracks (genre_id, file_size_bytes);
