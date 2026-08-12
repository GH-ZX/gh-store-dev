-- Wallet operations the application is allowed to perform.
--
-- `credit_wallet` and `debit_wallet` are deliberately service-role only, so
-- nothing in a browser session can move money by calling them. But the admin
-- dashboard needs to correct a balance, and shipping the service-role key into
-- the app to do it would hand every request full database authority.
--
-- Instead this adds one narrow, admin-gated entry point. Authorization lives in
-- the database — `is_admin(auth.uid())` — so a compromised dashboard route still
-- cannot adjust a balance without an admin session.
create or replace function public.admin_adjust_wallet(
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
  v_actor uuid := auth.uid();
begin
  if not public.is_admin(v_actor) then
    raise exception 'Administrator access required';
  end if;

  if p_amount is null or p_amount = 0 then
    raise exception 'Wallet adjustment amount must not be zero';
  end if;

  -- Replaying the same key returns the original result instead of adjusting
  -- twice, so a double-submitted form cannot double-credit a customer.
  if p_idempotency_key is not null then
    select wt.wallet_id, wt.balance_after, wt.id, true
    into wallet_id, balance, transaction_id, idempotent
    from public.wallet_transactions wt
    where wt.idempotency_key = p_idempotency_key;

    if found then
      return next;
      return;
    end if;
  end if;

  select w.id, w.balance
  into v_wallet_id, v_before
  from public.wallets w
  where w.user_id = p_user_id
  for update;

  if v_wallet_id is null then
    raise exception 'Wallet not found';
  end if;

  v_after := v_before + p_amount;

  if v_after < 0 then
    raise exception 'Adjustment would leave a negative balance';
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
    v_wallet_id,
    p_user_id,
    'adjustment',
    p_amount,
    v_before,
    v_after,
    'admin_adjustment',
    v_actor,
    p_idempotency_key,
    p_description,
    jsonb_build_object('adjusted_by', v_actor)
  )
  returning id into v_transaction_id;

  return query select v_wallet_id, v_after, v_transaction_id, false;
end;
$$;

revoke all on function public.admin_adjust_wallet(uuid, numeric, text, uuid) from public, anon;
grant execute on function public.admin_adjust_wallet(uuid, numeric, text, uuid) to authenticated;

-- Every customer needs a wallet row for the balance page to render. The signup
-- trigger creates one, but a user inserted before that trigger existed — or by a
-- direct admin API call during setup — would have none.
insert into public.wallets (user_id)
select p.id
from public.profiles p
left join public.wallets w on w.user_id = p.id
where w.id is null;

comment on function public.admin_adjust_wallet(uuid, numeric, text, uuid) is
  'Admin-only wallet correction. Writes an append-only adjustment transaction and refuses to leave a negative balance.';
