-- Extra fields for Meta Facebook Login → Instagram Business Account
alter table public.instagram_accounts
  add column if not exists facebook_page_id text,
  add column if not exists facebook_page_name text,
  add column if not exists page_access_token text,
  add column if not exists token_type text default 'page',
  add column if not exists refresh_token text;

comment on column public.instagram_accounts.access_token is
  'User or page token used for Graph calls';
comment on column public.instagram_accounts.page_access_token is
  'Facebook Page token linked to the IG Business account';
