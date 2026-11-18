-- =============================================================================
-- Usernames instead of emails, and password recovery codes.
--
-- * Accounts are created by the server (app/api/auth/signup) with the Supabase
--   admin API, using a placeholder address <username>@users.invalid that never
--   receives mail. The username travels in user_metadata and is copied into
--   public.users by handle_new_user().
-- * Recovery: at signup the client wraps the private key under a random
--   recovery code as well as under the password. The server stores only that
--   blob and a verifier (SHA-256 of a proof derived from the code), so it can
--   check a recovery attempt without ever seeing the code or the key.
--
-- Run after 20261118000000_harden_rls.sql. Runs in one transaction.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1. Columns
-- -----------------------------------------------------------------------------
alter table public.users
  add column if not exists username text,
  add column if not exists recovery_key_encrypted text,
  add column if not exists recovery_verifier text;

-- Backfill existing accounts from the email's local part, oldest account
-- first, adding -2, -3, ... until the name is free.
do $$
declare
  r record;
  base text;
  candidate text;
  n int;
begin
  for r in
    select id, email from public.users where username is null
    order by created_at, id
  loop
    base := left(regexp_replace(regexp_replace(
              lower(split_part(coalesce(r.email, ''), '@', 1)),
              '[^a-z0-9_.-]', '', 'g'), '^[^a-z0-9]+', ''), 24);
    if base = '' then base := 'user'; end if;
    if length(base) < 3 then base := base || 'user'; end if;
    candidate := base;
    n := 1;
    while exists (select 1 from public.users where username = candidate) loop
      n := n + 1;
      candidate := base || '-' || n;
    end loop;
    update public.users set username = candidate where id = r.id;
  end loop;
end $$;

-- Make the backfilled names visible in the UI (it reads user_metadata).
update auth.users a
set raw_user_meta_data = coalesce(a.raw_user_meta_data, '{}'::jsonb)
                         || jsonb_build_object('username', u.username)
from public.users u
where u.id = a.id
  and (a.raw_user_meta_data ->> 'username') is null;

alter table public.users
  alter column username set not null,
  add constraint users_username_format
    check (username ~ '^[a-z0-9][a-z0-9_.-]{2,31}$'),
  add constraint users_recovery_verifier_format
    check (recovery_verifier is null or recovery_verifier ~ '^[0-9a-f]{64}$');

create unique index if not exists users_username_key on public.users (username);

-- -----------------------------------------------------------------------------
-- 2. New-user trigger: carry the username over. A missing or malformed
--    username fails the insert, so the bare public sign-up endpoint cannot
--    create usable accounts (it should also be switched off in the dashboard).
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, email, username, public_key, created_at)
  values (new.id, new.email,
          lower(trim(new.raw_user_meta_data ->> 'username')), '', now())
  on conflict (id) do nothing;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Column privileges.
--    * email is no longer shown anywhere; stop exposing it to people you
--      share with.
--    * public_key is now set by the server at signup only.
--    * recovery columns: writable by the owner (to rotate the code), never
--      readable by clients.
-- -----------------------------------------------------------------------------
revoke select (email) on public.users from authenticated;
grant  select (username) on public.users to authenticated;

revoke update (public_key) on public.users from authenticated;
grant  update (recovery_key_encrypted, recovery_verifier)
  on public.users to authenticated;

-- -----------------------------------------------------------------------------
-- 4. RPCs
-- -----------------------------------------------------------------------------
drop function if exists public.find_user_by_email(text);

create or replace function public.find_user_by_username(p_username text)
returns table (id uuid, username text, public_key text)
language sql stable security definer set search_path = '' as $$
  select u.id, u.username, u.public_key from public.users u
  where (select auth.uid()) is not null
    and u.username = lower(trim(p_username))
    and coalesce(u.public_key, '') <> ''
  limit 1;
$$;

create or replace function public.has_recovery_setup()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.users u
    where u.id = (select auth.uid()) and u.recovery_verifier is not null
  );
$$;

revoke all on function public.find_user_by_username(text) from public, anon;
revoke all on function public.has_recovery_setup() from public, anon;
grant execute on function public.find_user_by_username(text) to authenticated;
grant execute on function public.has_recovery_setup() to authenticated;

commit;
