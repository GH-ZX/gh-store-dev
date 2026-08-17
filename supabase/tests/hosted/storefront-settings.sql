do $$
declare
  required_table text;
  required_tables text[] := array['store_settings', 'reviews'];
  table_is_rls_enabled boolean;
  public_settings jsonb;
begin
  foreach required_table in array required_tables loop
    if to_regclass(format('public.%s', required_table)) is null then
      raise exception 'Missing storefront settings table: %', required_table;
    end if;

    select c.relrowsecurity
    into table_is_rls_enabled
    from pg_class c
    where c.oid = format('public.%s', required_table)::regclass;

    if not table_is_rls_enabled then
      raise exception 'RLS is not enabled on table: %', required_table;
    end if;
  end loop;

  -- Settings must never be directly readable by visitors.
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'store_settings'
      and 'anon' = any (roles)
  ) then
    raise exception 'store_settings must not expose an anon select policy';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'reviews'
      and policyname = 'reviews_select_public_approved'
  ) then
    raise exception 'Missing approved-reviews public policy';
  end if;

  if not exists (select 1 from public.store_settings where id = 'global') then
    raise exception 'Missing singleton store_settings row';
  end if;

  select public.get_public_store_settings() into public_settings;

  if public_settings is null then
    raise exception 'get_public_store_settings returned no settings';
  end if;

  if public_settings ? 'payments' or public_settings ? 'providers' then
    raise exception 'Public settings must not expose payment or provider configuration';
  end if;

  if jsonb_typeof(public_settings -> 'home_layout') <> 'array' then
    raise exception 'Public settings home_layout must be an array';
  end if;

  if not (public_settings ? 'branding') then
    raise exception 'Public settings must expose the branding block';
  end if;

  if jsonb_typeof(public_settings -> 'branding') <> 'object' then
    raise exception 'Public settings branding must be an object';
  end if;

  if jsonb_typeof(public.get_home_layout()) <> 'array' then
    raise exception 'get_home_layout must return an array';
  end if;
end;
$$;
