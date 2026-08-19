-- Gift checkout: the owner buys without a wallet.
--
-- The admin has no customer wallet — they run the store, and a purchase by them
-- is a gift (either to a customer or to themselves). The order must still exist
-- as a normal, paid invoice so it is counted with the store's other invoices and
-- profit; what is different is that no balance is debited anywhere.
--
-- Mirror of place_wallet_order with the money step removed. The same rules hold:
--   * The buyer is always `auth.uid()`, and only a real admin (role + active).
--   * The price is re-read from the database; a client-supplied price is ignored.
--   * The idempotency key is claimed by INSERT before any work, so a replay
--     returns the original order instead of gifting twice.
--   * Fulfilment stays a separate, service-authority step exactly as for wallet
--     orders, because the gift order is `paid` the moment it exists.
create or replace function public.place_gift_order(
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
  v_offer record;
  v_quantity integer := coalesce(p_quantity, 1);
  v_unit_price numeric(12, 2);
  v_total numeric(12, 2);
  v_order_id uuid;
  v_order_number text;
  v_item_id uuid;
  v_stored jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  if not public.is_admin(v_user_id) then
    raise exception 'Administrator required' using errcode = 'P0001';
  end if;

  if p_idempotency_key is null then
    raise exception 'Idempotency key required' using errcode = 'P0001';
  end if;

  if v_quantity < 1 or v_quantity > 10 then
    raise exception 'Invalid quantity' using errcode = 'P0001';
  end if;

  -- Claim the key first, exactly as the wallet path does.
  begin
    insert into public.idempotency_keys (key, user_id, operation, expires_at)
    values (p_idempotency_key, v_user_id, 'place_gift_order', timezone('utc', now()) + interval '7 days');
  exception
    when unique_violation then
      select ik.response_body into v_stored
      from public.idempotency_keys ik
      where ik.key = p_idempotency_key
        and ik.user_id = v_user_id
        and ik.operation = 'place_gift_order';

      if v_stored is null then
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

  -- Paid on arrival: a gift order has no balance to debit. The invoice is
  -- recorded like any other so the store's profit and order history include it.
  insert into public.orders (
    user_id, status, payment_status, payment_method, currency,
    subtotal, discount, total, customer_note
  )
  values (
    v_user_id, 'paid', 'paid', 'gift', v_offer.currency,
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

  update public.idempotency_keys
  set response_status = 200,
      response_body = jsonb_build_object(
        'order_id', v_order_id,
        'order_number', v_order_number,
        'total', v_total,
        'balance', 0,
        'order_item_id', v_item_id
      )
  where key = p_idempotency_key;

  return query select v_order_id, v_order_number, v_total, 0::numeric, false;
end;
$$;

revoke all on function public.place_gift_order(uuid, integer, jsonb, uuid, text) from public, anon;
grant execute on function public.place_gift_order(uuid, integer, jsonb, uuid, text) to authenticated;