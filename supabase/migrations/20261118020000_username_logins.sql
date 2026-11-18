-- =============================================================================
-- Move accounts created before usernames onto username login.
--
-- Each account's login address becomes <username>@users.invalid, the same
-- placeholder the sign-up route uses, so everyone signs in with their username.
-- Passwords, keys and files are unchanged. Real email addresses are removed
-- from the database.
--
-- Run after 20261118010000_usernames_and_recovery.sql. Safe to run twice.
-- =============================================================================
begin;

update auth.users a
set email = u.username || '@users.invalid',
    email_confirmed_at = coalesce(a.email_confirmed_at, now()),
    email_change = '',
    email_change_token_new = '',
    email_change_token_current = '',
    updated_at = now()
from public.users u
where u.id = a.id
  and a.email is distinct from u.username || '@users.invalid';

update auth.identities i
set identity_data = i.identity_data
      || jsonb_build_object('email', u.username || '@users.invalid',
                            'email_verified', true),
    updated_at = now()
from public.users u
where i.user_id = u.id
  and i.provider = 'email'
  and i.identity_data ->> 'email' is distinct from u.username || '@users.invalid';

update public.users
set email = username || '@users.invalid'
where email is distinct from username || '@users.invalid';

commit;
