do $$
declare
  required_table text;
  required_tables text[] := array[
    'categories',
    'products',
    'games',
    'game_regions',
    'game_input_fields',
    'offers',
    'provider_game_mappings',
    'provider_product_mappings',
    'provider_offer_mappings'
  ];
  table_is_rls_enabled boolean;
begin
  foreach required_table in array required_tables loop
    if to_regclass(format('public.%s', required_table)) is null then
      raise exception 'Missing catalog table: %', required_table;
    end if;

    select c.relrowsecurity
    into table_is_rls_enabled
    from pg_class c
    where c.oid = format('public.%s', required_table)::regclass;

    if not table_is_rls_enabled then
      raise exception 'RLS is not enabled on catalog table: %', required_table;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'offers'
      and policyname = 'offers_select_public_active'
  ) then
    raise exception 'Missing public offers policy';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'provider_offer_mappings'
      and policyname = 'provider_offer_mappings_admin_all'
  ) then
    raise exception 'Missing provider offer admin policy';
  end if;
end;
$$;
