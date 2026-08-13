-- Give the crediting function real defaults.
--
-- Two of its arguments are genuinely optional: an omitted credit amount means
-- "credit exactly what was requested", and there is no actor when the server
-- credits automatically rather than a person approving. Without SQL defaults the
-- generated client types demand all four, which pushed callers toward passing a
-- cast null — a type lie standing in for a schema fact.
create or replace function public.credit_recharge_request(
  p_request_id uuid,
  p_credit_amount numeric default null,
  p_note text default null,
  p_actor uuid default null
)
returns table (credited numeric, balance numeric, idempotent boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_amount numeric(12, 2);
  v_wallet_id uuid;
  v_before numeric(12, 2);
  v_after numeric(12, 2);
  v_existing uuid;
begin
  select r.id, r.user_id, r.requested_amount, r.status, r.reference, r.payment_method
  into v_request
  from public.recharge_requests r
  where r.id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Request not found' using errcode = 'P0001';
  end if;

  -- Already credited: report the current state instead of crediting again.
  select wt.id into v_existing
  from public.wallet_transactions wt
  where wt.idempotency_key = p_request_id;

  if v_existing is not null then
    select w.balance into v_after from public.wallets w where w.user_id = v_request.user_id;
    return query select v_request.requested_amount, v_after, true;
    return;
  end if;

  if v_request.status in ('approved', 'rejected', 'cancelled', 'expired') then
    raise exception 'Request is already settled' using errcode = 'P0001';
  end if;

  v_amount := round(coalesce(p_credit_amount, v_request.requested_amount), 2);

  if v_amount <= 0 then
    raise exception 'Invalid credit amount' using errcode = 'P0001';
  end if;

  select w.id, w.balance
  into v_wallet_id, v_before
  from public.wallets w
  where w.user_id = v_request.user_id
  for update;

  if v_wallet_id is null then
    raise exception 'Wallet not found' using errcode = 'P0001';
  end if;

  v_after := v_before + v_amount;

  update public.wallets
  set balance = v_after,
      version = version + 1
  where id = v_wallet_id;

  insert into public.wallet_transactions (
    wallet_id, user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, idempotency_key, payment_method, description, metadata
  )
  values (
    v_wallet_id, v_request.user_id, 'deposit', v_amount, v_before, v_after,
    'recharge', v_request.id, v_request.id, v_request.payment_method,
    'Recharge ' || v_request.reference,
    jsonb_build_object('approved_by', p_actor, 'reference', v_request.reference)
  );

  update public.recharge_requests
  set status = 'approved',
      wallet_credit_amount = v_amount,
      admin_note = nullif(btrim(coalesce(p_note, '')), ''),
      reviewed_by = p_actor,
      reviewed_at = timezone('utc', now())
  where id = v_request.id;

  return query select v_amount, v_after, false;
end;
$$;

revoke all on function public.credit_recharge_request(uuid, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.credit_recharge_request(uuid, numeric, text, uuid) to service_role;

comment on function public.credit_recharge_request(uuid, numeric, text, uuid) is
  'Service-role only. Credits a wallet for a recharge request, once per request id. Automatic approval calls this; a customer session cannot.';
