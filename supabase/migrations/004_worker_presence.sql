-- Global worker heartbeat (one Python worker serves all tenants)
create table if not exists public.worker_presence (
  id text primary key default 'main',
  last_seen_at timestamptz not null default now(),
  hostname text,
  meta jsonb not null default '{}'::jsonb
);

alter table public.worker_presence enable row level security;

drop policy if exists "Authenticated read worker presence" on public.worker_presence;
create policy "Authenticated read worker presence"
  on public.worker_presence for select
  to authenticated
  using (true);
