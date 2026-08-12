do $$
declare
  required_table text;
  required_tables text[] := array[
    'wallets',
    'wallet_transactions',
    'recharge_requests',
    'payment_attempts',
    'payment_events'
  ];
begin
  foreach required_table in array required_tables loop
    if to_regclass(format('public.%s', required_table)) is null then
      raise exception 'Missing wallet table: %', required_table;
    end if;

    if not (
      select c.relrowsecurity
      from pg_class c
      where c.oid = format('public.%s', required_table)::regclass
    ) then
      raise exception 'RLS is not enabled on wallet table: %', required_table;
    end if;
  end loop;

  if not exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'credit_wallet'
      and pg_get_function_identity_arguments(oid) like 'p_user_id uuid%'
  ) then
    raise exception 'Missing credit_wallet RPC';
  end if;

  if not exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'debit_wallet'
      and pg_get_function_identity_arguments(oid) like 'p_user_id uuid%'
  ) then
    raise exception 'Missing debit_wallet RPC';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'wallet_transactions'
      and policyname like '%insert%'
  ) then
    raise exception 'Wallet transactions must not have a direct insert policy';
  end if;
end;
$$;
