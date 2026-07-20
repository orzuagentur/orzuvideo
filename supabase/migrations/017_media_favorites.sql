-- User favorites from Media (Pexels video/photo + Jamendo music)
create table if not exists public.media_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('video', 'photo', 'music')),
  asset_id text not null,
  title text,
  author text,
  thumb text,
  preview_url text,
  download_url text,
  duration_sec integer,
  width integer,
  height integer,
  page_url text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, kind, asset_id)
);

create index if not exists media_favorites_user_created_idx
  on public.media_favorites (user_id, created_at desc);

create index if not exists media_favorites_user_kind_idx
  on public.media_favorites (user_id, kind);

alter table public.media_favorites enable row level security;

drop policy if exists "Users manage own media favorites" on public.media_favorites;
create policy "Users manage own media favorites"
  on public.media_favorites for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
