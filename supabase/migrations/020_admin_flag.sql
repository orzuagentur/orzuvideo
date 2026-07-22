-- Admin flag for the separate OrzuAi admin console.
-- Only profiles with is_admin = true may sign into admin/.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

create index if not exists profiles_is_admin_idx
  on public.profiles (id)
  where is_admin = true;

comment on column public.profiles.is_admin is
  'When true, this account may sign into the separate admin app (admin/).';
