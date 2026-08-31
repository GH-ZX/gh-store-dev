-- Telegram owner operations.
--
-- The webhook is service-role backed, but money-moving actions still carry an
-- explicit active-admin actor so the database remains the authorization boundary.

create or replace function public.telegram_admin_adjust_wallet(
  p_actor uuid,
  p_user_id uuid,
  p_amount numeric,
  p_description text default null,
  p_idempotency_key uuid default null
)
returns table (
  wallet_id uuid,
  balance numeric,
  transaction_id uuid,
  idempotent boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet_id uuid;
  v_before numeric(12, 2);
  v_after numeric(12, 2);
  v_transaction_id uuid;
begin
  if not public.is_admin(p_actor) then
    raise exception 'Administrator access required' using errcode = 'P0001';
  end if;

  if p_user_id is null or p_amount is null or p_amount = 0 or abs(p_amount) > 100000 then
    raise exception 'Invalid wallet adjustment' using errcode = 'P0001';
  end if;

  if p_idempotency_key is not null then
    select wt.wallet_id, wt.balance_after, wt.id, true
    into wallet_id, balance, transaction_id, idempotent
    from public.wallet_transactions wt
    where wt.idempotency_key = p_idempotency_key
      and wt.user_id = p_user_id;

    if found then
      return next;
      return;
    end if;

    if exists (
      select 1 from public.wallet_transactions wt
      where wt.idempotency_key = p_idempotency_key
    ) then
      raise exception 'Idempotency key belongs to another wallet' using errcode = 'P0001';
    end if;
  end if;

  select w.id, w.balance
  into v_wallet_id, v_before
  from public.wallets w
  where w.user_id = p_user_id
  for update;

  if v_wallet_id is null then
    raise exception 'Wallet not found' using errcode = 'P0001';
  end if;

  v_after := v_before + p_amount;

  if v_after < 0 then
    raise exception 'Adjustment would leave a negative balance' using errcode = 'P0001';
  end if;

  update public.wallets
  set balance = v_after,
      version = version + 1
  where id = v_wallet_id;

  insert into public.wallet_transactions (
    wallet_id, user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, idempotency_key, description, metadata
  )
  values (
    v_wallet_id, p_user_id, 'adjustment', p_amount, v_before, v_after,
    'telegram_admin_adjustment', p_actor, p_idempotency_key,
    nullif(btrim(coalesce(p_description, '')), ''),
    jsonb_build_object('adjusted_by', p_actor, 'source', 'telegram')
  )
  returning id into v_transaction_id;

  return query select v_wallet_id, v_after, v_transaction_id, false;
end;
$$;

revoke all on function public.telegram_admin_adjust_wallet(uuid, uuid, numeric, text, uuid)
  from public, anon, authenticated;

grant execute on function public.telegram_admin_adjust_wallet(uuid, uuid, numeric, text, uuid)
  to service_role;

create or replace function public.telegram_admin_reject_recharge(
  p_actor uuid,
  p_request_id uuid,
  p_note text default null
)
returns table (status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.is_admin(p_actor) then
    raise exception 'Administrator access required' using errcode = 'P0001';
  end if;

  update public.recharge_requests
  set status = 'rejected',
      admin_note = nullif(btrim(coalesce(p_note, '')), ''),
      reviewed_by = p_actor,
      reviewed_at = timezone('utc', now())
  where id = p_request_id
    and status in ('pending', 'payment_sent', 'processing')
  returning recharge_requests.status into v_status;

  if v_status is null then
    raise exception 'Request cannot be rejected' using errcode = 'P0001';
  end if;

  return query select v_status;
end;
$$;

revoke all on function public.telegram_admin_reject_recharge(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.telegram_admin_reject_recharge(uuid, uuid, text)
  to service_role;
