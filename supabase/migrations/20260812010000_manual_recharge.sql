-- Customer-facing recharge.
--
-- A request is only a claim ("I sent you money"). It moves nothing. Approval is
-- what credits a wallet, and approval is admin-gated or — when the owner turns
-- automatic approval on — a decision made by the server with service authority.
-- A customer's session can never approve anything, including their own request;
-- if it could, anyone could fund themselves without paying.

-- Presentation-safe recharge configuration.
--
-- `store_settings.payments` will also hold the Sam API key, so it is never read
-- wholesale by a page. This returns only what a customer needs to see: which
-- methods are on, and how to pay with them.
create or replace function public.get_recharge_methods()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_build_object(
      'methods', coalesce(settings.payments -> 'manual_methods', '[]'::jsonb),
      'min_amount', coalesce(settings.payments -> 'min_amount', '1'::jsonb),
      'max_amount', coalesce(settings.payments -> 'max_amount', '1000'::jsonb),
      'currency', coalesce(settings.payments -> 'currency', '"USD"'::jsonb),
      'note_ar', coalesce(settings.payments -> 'note_ar', 'null'::jsonb),
      'note_en', coalesce(settings.payments -> 'note_en', 'null'::jsonb)
    ),
    '{}'::jsonb
  )
  from public.store_settings as settings
  where settings.id = 'global';
$$;

revoke all on function public.get_recharge_methods() from public;
grant execute on function public.get_recharge_methods() to anon, authenticated;

-- A customer submits a claim.
--
-- The reference is generated here rather than accepted from the browser, so it is
-- unique, unguessable, and usable as the payment note the customer quotes.
create or replace function public.submit_recharge_request(
  p_amount numeric,
  p_method text,
  p_currency text default 'USD'
)
returns table (request_id uuid, reference text, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_active boolean;
  v_reference text;
  v_id uuid;
  v_pending integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  select p.is_active into v_is_active from public.profiles p where p.id = v_user_id;

  if v_is_active is not true then
    raise exception 'Account suspended' using errcode = 'P0001';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount > 100000 then
    raise exception 'Invalid amount' using errcode = 'P0001';
  end if;

  if coalesce(btrim(p_method), '') = '' then
    raise exception 'Payment method required' using errcode = 'P0001';
  end if;

  -- A queue of identical claims is noise for whoever reviews them, and a way to
  -- bury a real request. Five open at once is generous.
  select count(*) into v_pending
  from public.recharge_requests r
  where r.user_id = v_user_id
    and r.status in ('pending', 'payment_sent', 'processing');

  if v_pending >= 5 then
    raise exception 'Too many open recharge requests' using errcode = 'P0001';
  end if;

  v_reference := 'RC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.recharge_requests (
    user_id, reference, requested_amount, requested_currency, payment_method, status
  )
  values (v_user_id, v_reference, p_amount, coalesce(p_currency, 'USD'), btrim(p_method), 'pending')
  returning id into v_id;

  return query select v_id, v_reference, 'pending'::text;
end;
$$;

revoke all on function public.submit_recharge_request(numeric, text, text) from public, anon;
grant execute on function public.submit_recharge_request(numeric, text, text) to authenticated;

-- The customer marks a request as paid. Still moves no money.
create or replace function public.mark_recharge_paid(p_request_id uuid)
returns table (status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  update public.recharge_requests r
  set status = 'payment_sent'
  where r.id = p_request_id
    and r.user_id = v_user_id
    and r.status = 'pending'
  returning r.status into v_status;

  if v_status is null then
    raise exception 'Request not found' using errcode = 'P0001';
  end if;

  return query select v_status;
end;
$$;

revoke all on function public.mark_recharge_paid(uuid) from public, anon;
grant execute on function public.mark_recharge_paid(uuid) to authenticated;

/*
 * Approve and credit.
 *
 * The credited amount can differ from the requested one — a customer may send a
 * different sum than they typed — so the approver supplies what actually
 * arrived, defaulting to the request.
 *
 * Idempotent on the request id: the wallet transaction carries it as its
 * idempotency key, so approving twice credits once. `p_actor` exists so the
 * automatic path can record who (or what) approved without an auth session.
 */
create or replace function public.credit_recharge_request(
  p_request_id uuid,
  p_credit_amount numeric,
  p_note text,
  p_actor uuid
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

-- The admin-facing approval. Gated in the database, not by the caller.
create or replace function public.approve_recharge_request(
  p_request_id uuid,
  p_credit_amount numeric default null,
  p_note text default null
)
returns table (credited numeric, balance numeric, idempotent boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if not public.is_admin(v_actor) then
    raise exception 'Administrator access required' using errcode = 'P0001';
  end if;

  return query
  select * from public.credit_recharge_request(p_request_id, p_credit_amount, p_note, v_actor);
end;
$$;

revoke all on function public.approve_recharge_request(uuid, numeric, text) from public, anon;
grant execute on function public.approve_recharge_request(uuid, numeric, text) to authenticated;

create or replace function public.reject_recharge_request(p_request_id uuid, p_note text default null)
returns table (status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_status text;
begin
  if not public.is_admin(v_actor) then
    raise exception 'Administrator access required' using errcode = 'P0001';
  end if;

  update public.recharge_requests r
  set status = 'rejected',
      admin_note = nullif(btrim(coalesce(p_note, '')), ''),
      reviewed_by = v_actor,
      reviewed_at = timezone('utc', now())
  where r.id = p_request_id
    -- A credited request cannot be rejected: the money is already out.
    and r.status not in ('approved', 'rejected')
  returning r.status into v_status;

  if v_status is null then
    raise exception 'Request cannot be rejected' using errcode = 'P0001';
  end if;

  return query select v_status;
end;
$$;

revoke all on function public.reject_recharge_request(uuid, text) from public, anon;
grant execute on function public.reject_recharge_request(uuid, text) to authenticated;

create index if not exists recharge_requests_open_idx
  on public.recharge_requests (status, created_at desc);

comment on function public.credit_recharge_request(uuid, numeric, text, uuid) is
  'Service-role only. Credits a wallet for a recharge request, once per request id. Automatic approval calls this; a customer session cannot.';
