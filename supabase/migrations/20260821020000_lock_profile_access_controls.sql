-- Profile access controls must not be mutable through a broad authenticated
-- update policy. The dashboard's role and suspension actions use the service-role
-- client only after checking the actor, target, and last-admin safeguards.
--
-- Without this boundary, an authenticated administrator could call Supabase
-- directly and bypass those safeguards by changing their own role/status or
-- disabling the last active administrator.

create or replace function public.protect_profile_access_controls()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     or new.is_active is distinct from old.is_active then
    if auth.role() <> 'service_role' then
      raise exception 'Only the controlled administrator service can change profile access';
    end if;

    -- Serialize service-role changes and keep at least one active administrator
    -- even when two dashboard requests arrive at the same time.
    perform pg_advisory_xact_lock(hashtext('gh_store_profile_access_controls'));

    if old.role = 'admin'
       and old.is_active = true
       and (new.role <> 'admin' or new.is_active is not true)
       and not exists (
         select 1
         from public.profiles
         where id <> old.id
           and role = 'admin'
           and is_active = true
       ) then
      raise exception 'At least one active administrator is required';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_access_controls
before update on public.profiles
for each row
execute function public.protect_profile_access_controls();

-- Admin role/status changes already use the service-role client after the
-- application-level last-admin and self-change checks. Removing this broad
-- policy prevents a direct REST/PostgREST update from bypassing those checks.
drop policy if exists profiles_update_admin on public.profiles;

comment on function public.protect_profile_access_controls() is
  'Only the controlled service-role administrator actions may change profile role or active status.';
