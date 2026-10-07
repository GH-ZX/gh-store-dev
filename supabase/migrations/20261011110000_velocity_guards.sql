-- Migration 20261011110000: Velocity and fraud guards
-- Tracks risk holds and provides an automated velocity checker for orders, recharges, and coupon redemptions.

create table if not exists public.risk_holds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('order', 'recharge', 'redeem')),
  reason text not null,
  ref_id text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

create index if not exists risk_holds_user_idx on public.risk_holds(user_id, created_at desc);
create index if not exists risk_holds_status_idx on public.risk_holds(status, created_at desc);

alter table public.risk_holds enable row level security;
alter table public.risk_holds force row level security;

-- Admin only RLS policy
drop policy if exists "Admins manage risk holds" on public.risk_holds;
create policy "Admins manage risk holds"
  on public.risk_holds
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
        and profiles.is_active = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
        and profiles.is_active = true
    )
  );

create or replace function public.check_velocity(
  p_user uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_at timestamptz;
  v_is_new_account boolean := false;
  v_count_10m integer := 0;
  v_count_24h integer := 0;
  v_limit_10m integer := 6;
  v_limit_24h integer := 25;
begin
  select created_at into v_created_at from public.profiles where id = p_user;
  if v_created_at is not null and v_created_at > timezone('utc', now()) - interval '24 hours' then
    v_is_new_account := true;
  end if;

  if p_action = 'order' then
    if v_is_new_account then
      v_limit_10m := 3;
      v_limit_24h := 10;
    else
      v_limit_10m := 6;
      v_limit_24h := 25;
    end if;

    select count(*) into v_count_10m
    from public.orders
    where user_id = p_user and created_at > timezone('utc', now()) - interval '10 minutes';

    select count(*) into v_count_24h
    from public.orders
    where user_id = p_user and created_at > timezone('utc', now()) - interval '24 hours';

  elsif p_action = 'recharge' then
    if v_is_new_account then
      v_limit_10m := 2;
      v_limit_24h := 5;
    else
      v_limit_10m := 4;
      v_limit_24h := 15;
    end if;

    select count(*) into v_count_10m
    from public.recharge_requests
    where user_id = p_user and created_at > timezone('utc', now()) - interval '10 minutes';

    select count(*) into v_count_24h
    from public.recharge_requests
    where user_id = p_user and created_at > timezone('utc', now()) - interval '24 hours';

  elsif p_action = 'redeem' then
    if v_is_new_account then
      v_limit_10m := 3;
      v_limit_24h := 10;
    else
      v_limit_10m := 6;
      v_limit_24h := 20;
    end if;

    select count(*) into v_count_10m
    from public.wallet_transactions
    where user_id = p_user
      and type in ('coupon', 'credit', 'voucher')
      and created_at > timezone('utc', now()) - interval '10 minutes';

    select count(*) into v_count_24h
    from public.wallet_transactions
    where user_id = p_user
      and type in ('coupon', 'credit', 'voucher')
      and created_at > timezone('utc', now()) - interval '24 hours';
  end if;

  if v_count_10m >= v_limit_10m then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'velocity_10m',
      'count', v_count_10m,
      'limit', v_limit_10m,
      'is_new_account', v_is_new_account
    );
  end if;

  if v_count_24h >= v_limit_24h then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'velocity_24h',
      'count', v_count_24h,
      'limit', v_limit_24h,
      'is_new_account', v_is_new_account
    );
  end if;

  return jsonb_build_object('allowed', true);
end;
$$;
