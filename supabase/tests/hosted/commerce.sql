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
