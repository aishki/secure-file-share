-- =============================================================================
-- Harden RLS, grants, storage and audit logging for secure-file-share.
--
-- State before this migration (from schema introspection, 2026-11-18):
--   * RLS was DISABLED on users, files, file_access, audit_log, so every
--     policy below was inert.
--   * `anon` held SELECT/INSERT/UPDATE/DELETE/TRUNCATE on files, file_access
--     and audit_log: anyone with the public anon key could read or wipe them.
--   * `authenticated` could read every user's private_key_encrypted, rewrite
--     anyone's public_key, and TRUNCATE tables (TRUNCATE ignores RLS).
--   * A user could insert a files row whose storage_path pointed at another
--     user's object, grant themselves access, and pass the storage
--     "shared download" policy.
--
-- Requires the client changes made in the same commit (RPCs for private key
-- and recipient lookup; audit rows are now written by triggers).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Helper functions live in a schema PostgREST does not expose.
-- -----------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_file_owner(fid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.files f
    where f.id = fid and f.owner_id = (select auth.uid())
  );
$$;

create or replace function private.has_file_access(fid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.file_access fa
    where fa.file_id = fid and fa.user_id = (select auth.uid())
  );
$$;

create or replace function private.file_access_level(fid uuid)
returns text language sql stable security definer set search_path = '' as $$
  select fa.access_level from public.file_access fa
  where fa.file_id = fid and fa.user_id = (select auth.uid());
$$;

-- Can the caller see `other`'s profile? Only if a file connects them:
-- `other` owns a file shared with the caller, or `other` has access to a
-- file the caller owns or collaborates on.
create or replace function private.shares_file_with(other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.files f
    join public.file_access fa on fa.file_id = f.id
    where fa.user_id = (select auth.uid()) and f.owner_id = other
  ) or exists (
    select 1 from public.file_access theirs
    join public.files f on f.id = theirs.file_id
    where theirs.user_id = other
      and (
        f.owner_id = (select auth.uid())
        or exists (
          select 1 from public.file_access mine
          where mine.file_id = f.id
            and mine.user_id = (select auth.uid())
            and mine.access_level = 'collaborator'
        )
      )
  );
$$;

-- Storage read check for shared objects. Also requires the object to sit in
-- the file owner's folder, so a legacy row with a spoofed storage_path
-- cannot be used to reach someone else's object.
create or replace function private.can_read_shared_object(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.files f
    join public.file_access fa on fa.file_id = f.id
    where f.storage_path = object_name
      and split_part(object_name, '/', 1) = f.owner_id::text
      and fa.user_id = (select auth.uid())
  );
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;

-- -----------------------------------------------------------------------------
-- 1. Drop every existing policy on the app tables (they are replaced below),
--    and the old public helper that RPC callers could reach.
-- -----------------------------------------------------------------------------
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('users', 'files', 'file_access', 'audit_log')
  loop
    execute format('drop policy %I on %I.%I',
                   p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

drop function if exists public.has_file_access(uuid);

-- -----------------------------------------------------------------------------
-- 2. Grants: nothing for anon; least privilege for authenticated.
--    Column-level grants keep private_key_encrypted out of every SELECT.
-- -----------------------------------------------------------------------------
revoke all on public.users, public.files, public.file_access, public.audit_log
  from anon, authenticated, public;

grant select (id, email, full_name, public_key, created_at, updated_at)
  on public.users to authenticated;
grant update (public_key, private_key_encrypted, full_name)
  on public.users to authenticated;

grant select, insert, delete on public.files to authenticated;

grant select, insert, delete on public.file_access to authenticated;
grant update (access_level) on public.file_access to authenticated;

grant select on public.audit_log to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Enable RLS.
-- -----------------------------------------------------------------------------
alter table public.users       enable row level security;
alter table public.files       enable row level security;
alter table public.file_access enable row level security;
alter table public.audit_log   enable row level security;

-- -----------------------------------------------------------------------------
-- 4. users
--    Rows are created by the handle_new_user() trigger (security definer),
--    so clients get no INSERT or DELETE.
-- -----------------------------------------------------------------------------
create policy users_select on public.users
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_file_with(id));

create policy users_update_own on public.users
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- A public key may be set once (signup), never replaced. Stops a hijacked
-- session from swapping in an attacker key that future shares would use.
create or replace function private.protect_public_key()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(old.public_key, '') <> ''
     and new.public_key is distinct from old.public_key then
    raise exception 'public_key cannot be changed once set'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

drop trigger if exists protect_public_key on public.users;
create trigger protect_public_key
  before update on public.users
  for each row execute function private.protect_public_key();

-- The owner's wrapped private key, the only way to read that column.
create or replace function public.get_my_private_key()
returns text language sql stable security definer set search_path = '' as $$
  select u.private_key_encrypted from public.users u
  where u.id = (select auth.uid());
$$;

-- Exact-match recipient lookup for sharing. Returns nothing for unknown
-- emails or users who have not finished key setup; never lists users.
create or replace function public.find_user_by_email(p_email text)
returns table (id uuid, public_key text)
language sql stable security definer set search_path = '' as $$
  select u.id, u.public_key from public.users u
  where (select auth.uid()) is not null
    and lower(u.email) = lower(trim(p_email))
    and coalesce(u.public_key, '') <> ''
  limit 1;
$$;

revoke all on function public.get_my_private_key() from public, anon;
revoke all on function public.find_user_by_email(text) from public, anon;
grant execute on function public.get_my_private_key() to authenticated;
grant execute on function public.find_user_by_email(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. files
--    No UPDATE: the app never edits file rows, and an editable storage_path
--    is how the storage spoof worked. The old is_public policy is dropped;
--    nothing in the app uses it.
-- -----------------------------------------------------------------------------
create policy files_select on public.files
  for select to authenticated
  using (owner_id = (select auth.uid()) or private.has_file_access(id));

create policy files_insert on public.files
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and split_part(storage_path, '/', 1) = (select auth.uid())::text
  );

create policy files_delete on public.files
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Same rule as a table constraint, for any future write path. NOT VALID so
-- existing rows are not checked here (a failure would abort the whole
-- migration); run the VALIDATE at the bottom of this file afterwards.
alter table public.files drop constraint if exists files_storage_path_in_owner_folder;
alter table public.files
  add constraint files_storage_path_in_owner_folder
  check (split_part(storage_path, '/', 1) = owner_id::text) not valid;

-- -----------------------------------------------------------------------------
-- 6. file_access
--    Owners manage everything. Collaborators may share onward, see the
--    access list, and revoke grants they made. Anyone may remove their own
--    access. Only owners change access levels (and only that column).
-- -----------------------------------------------------------------------------
create policy file_access_select on public.file_access
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_file_owner(file_id)
    or private.file_access_level(file_id) = 'collaborator'
  );

create policy file_access_insert on public.file_access
  for insert to authenticated
  with check (
    shared_by = (select auth.uid())
    and user_id <> (select auth.uid())
    and (
      private.is_file_owner(file_id)
      or private.file_access_level(file_id) = 'collaborator'
    )
  );

create policy file_access_update on public.file_access
  for update to authenticated
  using (private.is_file_owner(file_id))
  with check (private.is_file_owner(file_id));

create policy file_access_delete on public.file_access
  for delete to authenticated
  using (
    private.is_file_owner(file_id)
    or user_id = (select auth.uid())
    or (
      shared_by = (select auth.uid())
      and private.file_access_level(file_id) = 'collaborator'
    )
  );

-- -----------------------------------------------------------------------------
-- 7. audit_log: written only by triggers / the download RPC, read-only to
--    users. The file_id FK is dropped so log rows keep pointing at files
--    after they are deleted (ON DELETE SET NULL erased that history).
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint if exists audit_log_file_id_fkey;

create policy audit_log_select on public.audit_log
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or target_user_id = (select auth.uid())
    or (file_id is not null and private.is_file_owner(file_id))
  );

create or replace function private.write_audit(
  p_action text, p_file uuid, p_target uuid, p_details jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  h json := nullif(current_setting('request.headers', true), '')::json;
begin
  insert into public.audit_log
    (user_id, action, file_id, target_user_id, details, ip_address, user_agent)
  values (
    (select auth.uid()), p_action, p_file, p_target, p_details,
    nullif(trim(split_part(h ->> 'x-forwarded-for', ',', 1)), ''),
    h ->> 'user-agent'
  );
end $$;

create or replace function private.audit_files()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.write_audit('upload', new.id, null,
      jsonb_build_object('file_name', new.file_name, 'file_size', new.file_size));
    return new;
  else
    perform private.write_audit('delete', old.id, null,
      jsonb_build_object('file_name', old.file_name));
    return old;
  end if;
end $$;

create or replace function private.audit_file_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.write_audit('share', new.file_id, new.user_id,
      jsonb_build_object('access_level', new.access_level));
    return new;
  elsif tg_op = 'UPDATE' then
    perform private.write_audit('access_change', new.file_id, new.user_id,
      jsonb_build_object('from', old.access_level, 'to', new.access_level));
    return new;
  else
    -- Skip rows removed by the cascade from a file delete; that delete is
    -- already logged once.
    if exists (select 1 from public.files f where f.id = old.file_id) then
      perform private.write_audit('revoke_access', old.file_id, old.user_id,
        null);
    end if;
    return old;
  end if;
end $$;

drop trigger if exists audit_files on public.files;
create trigger audit_files
  after insert or delete on public.files
  for each row execute function private.audit_files();

drop trigger if exists audit_file_access on public.file_access;
create trigger audit_file_access
  after insert or delete or update of access_level on public.file_access
  for each row execute function private.audit_file_access();

-- Downloads happen in Storage, where no table trigger fires, so the client
-- reports them. The RPC checks access first, so it cannot log for files the
-- caller cannot read.
create or replace function public.log_file_download(p_file_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (private.is_file_owner(p_file_id)
          or private.has_file_access(p_file_id)) then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  perform private.write_audit('download', p_file_id, null, null);
end $$;

revoke all on function public.log_file_download(uuid) from public, anon;
grant execute on function public.log_file_download(uuid) to authenticated;

-- Functions created after the earlier blanket revoke. Only the RLS predicate
-- helpers may be executed by clients; write_audit and the trigger functions are
-- reached solely through SECURITY DEFINER callers (which run as the owner), so
-- clients cannot forge audit rows by calling them directly.
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.is_file_owner(uuid),
  private.has_file_access(uuid),
  private.file_access_level(uuid),
  private.shares_file_with(uuid),
  private.can_read_shared_object(text)
to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Storage: recreate policies scoped to authenticated users.
-- -----------------------------------------------------------------------------
drop policy if exists "Users can upload files" on storage.objects;
drop policy if exists "Users can download own files" on storage.objects;
drop policy if exists "Users can download shared files" on storage.objects;
drop policy if exists "Users can delete own files" on storage.objects;

create policy "encrypted-files: upload to own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'encrypted-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "encrypted-files: read own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'encrypted-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "encrypted-files: read shared" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'encrypted-files'
    and private.can_read_shared_object(name)
  );

create policy "encrypted-files: delete own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'encrypted-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Only ciphertext belongs in this bucket; cap object size (50 MB, the
-- Supabase free-tier limit; adjust to your plan).
update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array['application/octet-stream']
where id = 'encrypted-files';

commit;

-- -----------------------------------------------------------------------------
-- After applying: check whether any existing row breaks the storage-path rule
-- (would indicate tampering while the tables were open), then validate.
--
--   select id, owner_id, storage_path from public.files
--   where split_part(storage_path, '/', 1) <> owner_id::text;
--
--   alter table public.files validate constraint files_storage_path_in_owner_folder;
-- -----------------------------------------------------------------------------
