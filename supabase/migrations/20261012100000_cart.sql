-- 20261012100000_cart.sql
-- Multi-item cart storage and atomic cart checkout RPC.

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  offer_id uuid not null references public.offers(id) on delete cascade,
  quantity integer not null default 1 check (quantity >= 1 and quantity <= 10),
  dynamic_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint uq_cart_items_user_offer unique (user_id, offer_id)
);

create index if not exists idx_cart_items_user_id on public.cart_items(user_id);
create index if not exists idx_cart_items_offer_id on public.cart_items(offer_id);

alter table public.cart_items enable row level security;

drop policy if exists cart_items_owner_select on public.cart_items;
create policy cart_items_owner_select on public.cart_items
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists cart_items_owner_insert on public.cart_items;
create policy cart_items_owner_insert on public.cart_items
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists cart_items_owner_update on public.cart_items;
create policy cart_items_owner_update on public.cart_items
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists cart_items_owner_delete on public.cart_items;
create policy cart_items_owner_delete on public.cart_items
  for delete to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on public.cart_items to authenticated;

-- Cart checkout RPC
create or replace function public.place_cart_order(
  p_items jsonb,
  p_idempotency_key uuid,
  p_coupon_code text default null
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
  v_at timestamptz := timezone('utc', now());
  v_wallet_id uuid;
  v_before numeric(12, 2);
  v_after numeric(12, 2);
  v_item record;
  v_offer record;
  v_item_subtotal numeric(12, 2);
  v_total_all numeric(12, 2) := 0;
  v_order_id uuid;
  v_order_number text;
  v_item_id uuid;
  v_stored jsonb;
  v_result_orders jsonb := '[]'::jsonb;
  v_item_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  if p_idempotency_key is null then
    raise exception 'Idempotency key required' using errcode = 'P0001';
  end if;

  select p.is_active into v_is_active
  from public.profiles p
  where p.id = v_user_id;

  if v_is_active is not true then
    raise exception 'Account suspended' using errcode = 'P0001';
  end if;

  -- Claim idempotency key
  begin
    insert into public.idempotency_keys (key, user_id, operation, expires_at)
    values (p_idempotency_key, v_user_id, 'place_cart_order', timezone('utc', now()) + interval '7 days');
  exception
    when unique_violation then
      select ik.response_body into v_stored
      from public.idempotency_keys ik
      where ik.key = p_idempotency_key
        and ik.user_id = v_user_id
        and ik.operation = 'place_cart_order';

      if v_stored is null then
        raise exception 'Order already in progress' using errcode = 'P0001';
      end if;

      return query
      select (elem ->> 'order_id')::uuid,
             elem ->> 'order_number',
             (elem ->> 'total')::numeric,
             (elem ->> 'balance')::numeric,
             true
      from jsonb_array_elements(v_stored) as elem;
      return;
  end;

  -- Lock user wallet first
  select w.id, w.balance
  into v_wallet_id, v_before
  from public.wallets w
  where w.user_id = v_user_id
  for update;

  if v_wallet_id is null then
    raise exception 'Wallet not found' using errcode = 'P0001';
  end if;

  -- Phase 1: validate items and calculate total
  for v_item in
    select (value ->> 'offer_id')::uuid as offer_id,
           coalesce((value ->> 'quantity')::integer, 1) as quantity,
           coalesce(value -> 'dynamic_fields', '{}'::jsonb) as dynamic_fields
    from jsonb_array_elements(p_items)
  loop
    v_item_count := v_item_count + 1;
    if v_item.quantity < 1 or v_item.quantity > 10 then
      raise exception 'Invalid quantity' using errcode = 'P0001';
    end if;

    select o.id, o.price
    into v_offer
    from public.offers o
    join public.products p on p.id = o.product_id
    where o.id = v_item.offer_id
      and o.is_active = true
      and p.is_active = true;

    if v_offer.id is null then
      raise exception 'Offer unavailable' using errcode = 'P0001';
    end if;

    v_total_all := v_total_all + round(v_offer.price * v_item.quantity, 2);
  end loop;

  if v_item_count = 0 then
    raise exception 'Cart is empty' using errcode = 'P0001';
  end if;

  if v_before < v_total_all then
    raise exception 'Insufficient wallet balance' using errcode = 'P0001';
  end if;

  v_after := v_before - v_total_all;
  update public.wallets
  set balance = v_after,
      updated_at = v_at
  where id = v_wallet_id;

  -- Phase 2: Create orders and order items
  for v_item in
    select (value ->> 'offer_id')::uuid as offer_id,
           coalesce((value ->> 'quantity')::integer, 1) as quantity,
           coalesce(value -> 'dynamic_fields', '{}'::jsonb) as dynamic_fields
    from jsonb_array_elements(p_items)
  loop
    select o.id,
           o.product_id,
           o.name_ar,
           o.name_en,
           o.price,
           o.currency,
           o.offer_type
    into v_offer
    from public.offers o
    where o.id = v_item.offer_id;

    v_item_subtotal := round(v_offer.price * v_item.quantity, 2);

    insert into public.orders (
      user_id, status, payment_status, payment_method, currency,
      subtotal, discount, total, metadata
    )
    values (
      v_user_id, 'pending', 'pending', 'wallet', v_offer.currency,
      v_item_subtotal, 0, v_item_subtotal,
      jsonb_build_object('source', 'cart')
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
      v_offer.price,
      v_item.quantity,
      v_item_subtotal,
      v_item.dynamic_fields,
      jsonb_build_object('offer_type', v_offer.offer_type, 'product_id', v_offer.product_id)
    )
    returning id into v_item_id;

    insert into public.wallet_transactions (
      wallet_id, user_id, type, amount,
      balance_before, balance_after,
      reference_type, reference_id,
      description, metadata
    )
    values (
      v_wallet_id, v_user_id, 'purchase', -v_item_subtotal,
      v_before, v_before - v_item_subtotal,
      'order', v_order_id,
      'Cart item order #' || v_order_number,
      jsonb_build_object('order_id', v_order_id, 'offer_id', v_offer.id)
    );

    v_before := v_before - v_item_subtotal;

    -- Append to results array
    v_result_orders := v_result_orders || jsonb_build_object(
      'order_id', v_order_id,
      'order_number', v_order_number,
      'total', v_item_subtotal,
      'balance', v_after
    );
  end loop;

  -- Clear cart items for this user
  delete from public.cart_items
  where user_id = v_user_id;

  -- Record idempotency cache
  update public.idempotency_keys
  set response_body = v_result_orders
  where key = p_idempotency_key
    and user_id = v_user_id;

  return query
  select (elem ->> 'order_id')::uuid,
         elem ->> 'order_number',
         (elem ->> 'total')::numeric,
         (elem ->> 'balance')::numeric,
         false
  from jsonb_array_elements(v_result_orders) as elem;
end;
$$;

revoke all on function public.place_cart_order(jsonb, uuid, text) from public, anon;
grant execute on function public.place_cart_order(jsonb, uuid, text) to authenticated;
