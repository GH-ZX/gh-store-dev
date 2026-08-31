do $$
declare
  required_table text;
  required_tables text[] := array[
    'orders',
    'order_items',
    'idempotency_keys',
    'fulfillment_attempts',
    'fulfillment_events',
    'invoices',
    'notifications',
    'support_threads',
    'support_messages',
    'audit_logs'
  ];
begin
  foreach required_table in array required_tables loop
    if to_regclass(format('public.%s', required_table)) is null then
      raise exception 'Missing commerce table: %', required_table;
    end if;

    if not (
      select c.relrowsecurity
      from pg_class c
      where c.oid = format('public.%s', required_table)::regclass
    ) then
      raise exception 'RLS is not enabled on commerce table: %', required_table;
    end if;
  end loop;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'orders'
      and policyname = 'orders_select_own'
  ) then
    raise exception 'Missing own-order policy';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'orders'
      and policyname like '%insert%'
  ) then
    raise exception 'Orders must not have a direct insert policy';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_logs'
      and policyname = 'audit_logs_admin_select'
  ) then
    raise exception 'Missing audit admin policy';
  end if;
end;
$$;

do $$
declare
  function_signature text;
  function_oid regprocedure;
  function_definition text;
  failures text[] := array[]::text[];
  required_functions text[] := array[
    'public.place_wallet_order(uuid,integer,jsonb,uuid,text)',
    'public.place_gift_order(uuid,integer,jsonb,uuid,text)',
    'public.place_wallet_order_for_user(uuid,uuid,integer,jsonb,uuid,text)',
    'public.admin_overview_snapshot(integer)'
  ];
  rogue_functions text[] := array[
    'public.wallet_checkout(uuid,integer,text)',
    'public.gift_checkout(uuid,integer,text)',
    'public.admin_overview()'
  ];
begin
  if to_regclass('public.products') is null then
    failures := array_append(failures, 'Missing public.products');
  end if;

  if to_regclass('public.games') is not null then
    failures := array_append(failures, 'Legacy public.games still exists');
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'offers'
      and column_name = 'product_id'
  ) then
    failures := array_append(failures, 'Missing public.offers.product_id');
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'offers'
      and column_name = 'game_id'
  ) then
    failures := array_append(failures, 'Legacy public.offers.game_id still exists');
  end if;

  foreach function_signature in array required_functions loop
    function_oid := to_regprocedure(function_signature);

    if function_oid is null then
      failures := array_append(failures, 'Missing function ' || function_signature);
      continue;
    end if;

    function_definition := lower(pg_get_functiondef(function_oid));

    if position('public.games' in function_definition) > 0 then
      failures := array_append(failures, function_signature || ' references public.games');
    end if;

    if function_definition ~ '\m(game_id)\M' then
      failures := array_append(failures, function_signature || ' references offers.game_id');
    end if;
  end loop;

  foreach function_signature in array rogue_functions loop
    if to_regprocedure(function_signature) is not null then
      failures := array_append(failures, 'Rogue function exists: ' || function_signature);
    end if;
  end loop;

  if cardinality(failures) > 0 then
    raise exception 'Commerce cutover regression(s): %', array_to_string(failures, '; ');
  end if;
end;
$$;
