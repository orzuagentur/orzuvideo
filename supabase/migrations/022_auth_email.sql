-- Auth OTP, devices, password reset tokens, and email settings (Resend).

create table if not exists public.email_settings (
  id int primary key default 1 check (id = 1),
  from_email text not null default 'Support <support@orzuai.com>',
  from_name text not null default 'OrzuAi',
  reply_to text,
  updated_at timestamptz not null default now()
);

insert into public.email_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.auth_otp_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists auth_otp_codes_user_idx
  on public.auth_otp_codes (user_id, created_at desc);

create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_tokens_user_idx
  on public.password_reset_tokens (user_id, created_at desc);

create table if not exists public.auth_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_key text not null,
  device_name text not null default 'Unknown device',
  device_type text not null default 'unknown',
  user_agent text,
  ip text,
  location text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, device_key)
);

create index if not exists auth_devices_user_idx
  on public.auth_devices (user_id, last_seen_at desc);

alter table public.profiles
  add column if not exists welcome_email_sent_at timestamptz;

alter table public.email_settings enable row level security;
alter table public.auth_otp_codes enable row level security;
alter table public.password_reset_tokens enable row level security;
alter table public.auth_devices enable row level security;

-- Service role bypasses RLS; no public policies (admin/web use service role for these).

comment on table public.email_settings is 'Singleton Resend from-address config for OrzuAi transactional mail.';
comment on table public.auth_otp_codes is 'Login email verification codes (hashed).';
comment on table public.password_reset_tokens is 'Password reset links (hashed tokens).';
comment on table public.auth_devices is 'Known devices for new-login alerts.';
