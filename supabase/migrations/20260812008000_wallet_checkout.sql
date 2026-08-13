-- Checkout: one transaction that cannot half-happen.
--
-- `authenticated` holds SELECT only on orders and order_items, so a customer
-- cannot create or edit an order directly. Everything goes through this function,
-- which is the only place a wallet-paid order comes into existence.
--
-- Design rules that matter here:
--   * The buyer is always `auth.uid()`. There is no user_id parameter, so one
--     customer can never spend another's balance.
--   * The price is re-read from the database. A client-supplied price is ignored
--     entirely, so the browser cannot negotiate its own total.
--   * The wallet row is locked before the balance check, so two concurrent
--     checkouts cannot both pass a check that only one balance can satisfy.
--   * The idempotency key is claimed by INSERT before any work. A replay finds
--     the row and returns the original order instead of buying twice.
create or replace function public.place_wallet_order(
  p_offer_id uuid,
  p_quantity integer,
  p_dynamic_fields jsonb,
  p_idempotency_key uuid,
  p_customer_note text default null
)
returns table (
  order_id uuid,
  order_number text,
  total numeric,
  balance numeric,
  idempotent boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_active boolean;
  v_offer record;
  v_quantity integer := coalesce(p_quantity, 1);
  v_unit_price numeric(12, 2);
  v_total numeric(12, 2);
  v_wallet_id uuid;
  v_before numeric(12, 2);
  v_after numeric(12, 2);
  v_order_id uuid;
  v_order_number text;
  v_item_id uuid;
  v_transaction_id uuid;
  v_stored jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  if p_idempotency_key is null then
    raise exception 'Idempotency key required' using errcode = 'P0001';
  end if;

  if v_quantity < 1 or v_quantity > 10 then
    raise exception 'Invalid quantity' using errcode = 'P0001';
  end if;

  select p.is_active into v_is_active
  from public.profiles p
  where p.id = v_user_id;

  if v_is_active is not true then
    raise exception 'Account suspended' using errcode = 'P0001';
  end if;

  -- Claim the key first. A duplicate submit loses the race here rather than
  -- after the money has moved.
  begin
    insert into public.idempotency_keys (key, user_id, operation, expires_at)
    values (p_idempotency_key, v_user_id, 'place_order', timezone('utc', now()) + interval '7 days');
  exception
    when unique_violation then
      select ik.response_body into v_stored
      from public.idempotency_keys ik
      where ik.key = p_idempotency_key
        and ik.user_id = v_user_id
        and ik.operation = 'place_order';

      if v_stored is null then
        -- A concurrent request holds the key but has not finished yet. Saying so
        -- is safer than starting a second order under the same key.
        raise exception 'Order already in progress' using errcode = 'P0001';
      end if;

      return query
      select (v_stored ->> 'order_id')::uuid,
             v_stored ->> 'order_number',
             (v_stored ->> 'total')::numeric,
             (v_stored ->> 'balance')::numeric,
             true;
      return;
  end;

  -- Live price and availability, joined to the game so a hidden game cannot be
  -- bought through a still-active offer.
  select o.id,
         o.game_id,
         o.name_ar,
         o.name_en,
         o.price,
         o.currency,
         o.offer_type
  into v_offer
  from public.offers o
  join public.games g on g.id = o.game_id
  where o.id = p_offer_id
    and o.is_active = true
    and g.is_active = true;

  if v_offer.id is null then
    raise exception 'Offer unavailable' using errcode = 'P0001';
  end if;

  v_unit_price := v_offer.price;
  v_total := round(v_unit_price * v_quantity, 2);

  select w.id, w.balance
  into v_wallet_id, v_before
  from public.wallets w
  where w.user_id = v_user_id
  for update;

  if v_wallet_id is null then
    raise exception 'Wallet not found' using errcode = 'P0001';
  end if;

  if v_before < v_total then
    raise exception 'Insufficient wallet balance' using errcode = 'P0001';
  end if;

  v_after := v_before - v_total;

  insert into public.orders (
    user_id, status, payment_status, payment_method, currency,
    subtotal, discount, total, customer_note
  )
  values (
    v_user_id, 'pending', 'pending', 'wallet', v_offer.currency,
    v_total, 0, v_total, nullif(btrim(coalesce(p_customer_note, '')), '')
  )
  returning id, orders.order_number into v_order_id, v_order_number;

  insert into public.order_items (
    order_id, offer_id, name_ar_snapshot, name_en_snapshot,
    unit_price, quantity, total_price, dynamic_fields, metadata
  )
  values (
    v_order_id,
    v_offer.id,
    v_offer.name_ar,
    v_offer.name_en,
    v_unit_price,
    v_quantity,
    v_total,
    coalesce(p_dynamic_fields, '{}'::jsonb),
    jsonb_build_object('offer_type', v_offer.offer_type, 'game_id', v_offer.game_id)
  )
  returning id into v_item_id;

  update public.wallets
  set balance = v_after,
      version = version + 1
  where id = v_wallet_id;

  insert into public.wallet_transactions (
    wallet_id, user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, idempotency_key, payment_method, description
  )
  values (
    v_wallet_id, v_user_id, 'purchase', -v_total, v_before, v_after,
    'order', v_order_id, p_idempotency_key, 'wallet',
    'Order ' || v_order_number
  )
  returning id into v_transaction_id;

  -- Paid and waiting for fulfilment, which runs with service authority.
  update public.orders
  set status = 'paid',
      payment_status = 'paid',
      wallet_transaction_id = v_transaction_id
  where id = v_order_id;

  update public.idempotency_keys
  set response_status = 200,
      response_body = jsonb_build_object(
        'order_id', v_order_id,
        'order_number', v_order_number,
        'total', v_total,
        'balance', v_after,
        'order_item_id', v_item_id
      )
  where key = p_idempotency_key;

  return query select v_order_id, v_order_number, v_total, v_after, false;
end;
$$;

revoke all on function public.place_wallet_order(uuid, integer, jsonb, uuid, text) from public, anon;
grant execute on function public.place_wallet_order(uuid, integer, jsonb, uuid, text) to authenticated;

-- Refund a fulfilment that ended in terminal failure.
--
-- Service-role only, and deliberately so: it is the fulfilment worker's job, not
-- a customer's. If the customer's own session could call it, a shopper could
-- claim a refund on an order the supplier actually delivered.
create or replace function public.refund_failed_order(
  p_order_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns table (
  refunded boolean,
  balance numeric,
  idempotent boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_wallet_id uuid;
  v_before numeric(12, 2);
  v_after numeric(12, 2);
  v_existing uuid;
begin
  select o.id, o.user_id, o.total, o.payment_status, o.status, o.order_number
  into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'Order not found' using errcode = 'P0001';
  end if;

  -- Already refunded: report success without moving money again.
  if v_order.payment_status = 'refunded' then
    select w.balance into v_after from public.wallets w where w.user_id = v_order.user_id;
    return query select true, v_after, true;
    return;
  end if;

  if v_order.payment_status <> 'paid' then
    raise exception 'Order is not in a refundable state' using errcode = 'P0001';
  end if;

  select wt.id into v_existing
  from public.wallet_transactions wt
  where wt.idempotency_key = p_idempotency_key;

  if v_existing is not null then
    select w.balance into v_after from public.wallets w where w.user_id = v_order.user_id;
    return query select true, v_after, true;
    return;
  end if;

  select w.id, w.balance
  into v_wallet_id, v_before
  from public.wallets w
  where w.user_id = v_order.user_id
  for update;

  v_after := v_before + v_order.total;

  update public.wallets
  set balance = v_after,
      version = version + 1
  where id = v_wallet_id;

  insert into public.wallet_transactions (
    wallet_id, user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, idempotency_key, description
  )
  values (
    v_wallet_id, v_order.user_id, 'refund', v_order.total, v_before, v_after,
    'order', v_order.id, p_idempotency_key,
    coalesce(nullif(btrim(p_reason), ''), 'Fulfilment failed') || ' — ' || v_order.order_number
  );

  update public.orders
  set status = 'refunded',
      payment_status = 'refunded'
  where id = v_order.id;

  return query select true, v_after, false;
end;
$$;

revoke all on function public.refund_failed_order(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.refund_failed_order(uuid, text, uuid) to service_role;

grant select on public.idempotency_keys to authenticated;
