-- Assign / revoke OrzuAi admin access.
-- Run in Supabase → SQL Editor.
--
-- By email:
--   update public.profiles set is_admin = true where email = 'you@example.com';
--
-- By user id:
--   update public.profiles set is_admin = true where id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
--
-- Revoke:
--   update public.profiles set is_admin = false where email = 'you@example.com';
--
-- List admins:
--   select id, email, display_name, is_admin from public.profiles where is_admin = true;

update public.profiles
set is_admin = true
where email = 'REPLACE_WITH_ADMIN_EMAIL';
-- or: where id = 'REPLACE_WITH_USER_UUID';
;
