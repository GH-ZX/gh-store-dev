-- Repair the app-facing commerce RPCs after the final products cutover.
-- Preserve their established authorization, idempotency, wallet, ledger and
-- response contracts; only the catalog relation and offer foreign key change.

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

  -- Live price and availability, joined to the product so a hidden product cannot be
  -- bought through a still-active offer.
  select o.id,
         o.product_id,
         o.name_ar,
         o.name_en,
         o.price,
         o.currency,
         o.offer_type
  into v_offer
  from public.offers o
  join public.products p on p.id = o.product_id
  where o.id = p_offer_id
    and o.is_active = true
    and p.is_active = true;

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
    jsonb_build_object('offer_type', v_offer.offer_type, 'product_id', v_offer.product_id)
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

  -- Live price and availability, joined to the product so a hidden product cannot be
  -- bought through a still-active offer.
  select o.id,
         o.product_id,
         o.name_ar,
         o.name_en,
         o.price,
         o.currency,
         o.offer_type
  into v_offer
  from public.offers o
  join public.products p on p.id = o.product_id
  where o.id = p_offer_id
    and o.is_active = true
    and p.is_active = true;

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
    jsonb_build_object('offer_type', v_offer.offer_type, 'product_id', v_offer.product_id)
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

create or replace function public.place_wallet_order_for_user(
  p_user_id uuid,
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
  v_user_id uuid := p_user_id;
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

  -- Live price and availability, joined to the product so a hidden product cannot be
  -- bought through a still-active offer.
  select o.id,
         o.product_id,
         o.name_ar,
         o.name_en,
         o.price,
         o.currency,
         o.offer_type
  into v_offer
  from public.offers o
  join public.products p on p.id = o.product_id
  where o.id = p_offer_id
    and o.is_active = true
    and p.is_active = true;

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
    jsonb_build_object('offer_type', v_offer.offer_type, 'product_id', v_offer.product_id)
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

revoke all on function public.place_wallet_order_for_user(uuid, uuid, integer, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.place_wallet_order_for_user(uuid, uuid, integer, jsonb, uuid, text) to service_role;


create or replace function public.admin_overview_snapshot(p_grace_minutes integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  -- UTC day boundaries, matching every timestamp the store writes.
  v_today timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  v_week_start timestamptz := v_today - interval '6 days';
  v_prev_week_start timestamptz := v_today - interval '13 days';
  v_month_start timestamptz := v_today - interval '29 days';
  v_grace timestamptz := now() - make_interval(mins => greatest(coalesce(p_grace_minutes, 0), 0));
  v_catalog jsonb;
  v_attention jsonb;
  v_sales jsonb;
  v_earnings jsonb;
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Administrator access required' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'games', (select count(*) from public.products),
    'active_games', (select count(*) from public.products where is_active),
    'offers', (select count(*) from public.offers),
    'active_offers', (select count(*) from public.offers where is_active),
    'orders', (select count(*) from public.orders),
    'customers', (select count(*) from public.profiles where role = 'customer')
  )
  into v_catalog;

  /*
   * `payment_issues` is the reconciliation ladder from
   * `src/lib/payments/reconciliation-state.ts`, counted rather than listed. A
   * top-up carries three independent facts -- what the request says, what the
   * payment provider says, and whether a wallet transaction exists -- and the
   * order the branches are checked in is the whole point: an unbacked credit is
   * decided before anything else, and a payment that landed after its request
   * closed is still a fault rather than merely closed.
   *
   * Capped at the same two hundred rows the payments screen reads, so the badge
   * on the overview and the list behind it can never disagree.
   */
  with recent_requests as (
    select r.id, r.status
    from public.recharge_requests r
    order by r.created_at desc
    limit 200
  ),
  reconciled as (
    select
      r.status,
      exists (
        select 1
        from public.wallet_transactions t
        where t.reference_type = 'recharge'
          and t.reference_id = r.id
      ) as credited,
      -- A request is paid by at most one invoice; whichever provider's row
      -- exists is the one that speaks, and Sam answers first when both do.
      case when sam.invoice_id is not null then sam.status else binance.status end as invoice_status,
      case when sam.invoice_id is not null then sam.amount else binance.amount end as billed_amount,
      case when sam.invoice_id is not null then sam.charge_amount else binance.charge_amount end as paid_amount
    from recent_requests r
    left join lateral (
      select i.id as invoice_id, i.status, i.amount, i.charge_amount
      from public.sam_invoices i
      where i.recharge_request_id = r.id
      order by i.created_at, i.id
      limit 1
    ) sam on true
    left join lateral (
      select b.id as invoice_id, b.status, b.amount, b.charge_amount
      from public.binance_invoices b
      where b.recharge_request_id = r.id
      order by b.created_at, b.id
      limit 1
    ) binance on true
  ),
  facts as (
    select
      f.status,
      f.credited,
      f.invoice_status,
      -- `awaiting_review` is deliberately absent: the money arrived and the
      -- owner asked to see it first, so an uncredited wallet is intended.
      coalesce(f.invoice_status = any (array['paid', 'credited']), false) as paid,
      coalesce(f.paid_amount < f.billed_amount, false) as short
    from reconciled f
  )
  select jsonb_build_object(
    'stuck_orders', (
      select count(*)
      from public.orders
      where status = any (array['paid', 'fulfilling', 'processing'])
        and created_at < v_grace
    ),
    'pending_recharges', (
      select count(*)
      from public.recharge_requests
      where status = any (array['pending', 'reviewing'])
    ),
    'open_support_threads', (
      select count(*)
      from public.support_threads
      where status = any (array['open', 'pending'])
    ),
    'pending_reviews', (
      select count(*)
      from public.reviews
      where status = 'pending'
    ),
    'payment_issues', (
      select count(*)
      from facts f
      where case
        when f.credited and not f.paid and f.status <> 'approved' then true
        when f.credited then f.short
        when f.invoice_status = 'awaiting_review' then false
        when f.paid then true
        when f.status = 'approved' then true
        else false
      end
    )
  )
  into v_attention;

  select jsonb_build_object(
    'revenue_today', coalesce(sum(o.total) filter (where o.created_at >= v_today), 0),
    'revenue_7', coalesce(sum(o.total) filter (where o.created_at >= v_week_start), 0),
    -- Two bounds make "previous seven days" disjoint from the current one.
    'revenue_prev_7', coalesce(
      sum(o.total) filter (where o.created_at >= v_prev_week_start and o.created_at < v_week_start),
      0
    ),
    'orders_7', count(*) filter (where o.created_at >= v_week_start),
    'new_customers_7', (
      select count(*)
      from public.profiles p
      where p.role = 'customer'
        and p.created_at >= v_week_start
    )
  )
  into v_sales
  from public.orders o
  where o.payment_status = 'paid'
    and o.created_at >= v_prev_week_start;

  /*
   * Both earnings windows come out of one scan, the wider of the two, with the
   * shorter one carved out by `filter`. Supplier cost is multiplied by the line
   * quantity because the revenue it is subtracted from already is: three units
   * cost three times the supplier price, and pairing a scaled revenue with an
   * unscaled cost would flatter the store.
   *
   * An item whose offer carries no supplier mapping is counted rather than
   * guessed at. One unknown cost breaks the guarantee behind a profit figure,
   * and the caller turns a non-zero count into "not fully known".
   */
  select jsonb_build_object(
    'week', jsonb_build_object(
      'revenue', coalesce(sum(oi.total_price) filter (where oi.created_at >= v_week_start), 0),
      'cost', coalesce(sum(m.supplier_cost_usd * oi.quantity) filter (where oi.created_at >= v_week_start), 0),
      'unmapped_items', count(*) filter (where oi.created_at >= v_week_start and m.supplier_cost_usd is null)
    ),
    'month', jsonb_build_object(
      'revenue', coalesce(sum(oi.total_price), 0),
      'cost', coalesce(sum(m.supplier_cost_usd * oi.quantity), 0),
      'unmapped_items', count(*) filter (where m.supplier_cost_usd is null)
    )
  )
  into v_earnings
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  left join lateral (
    select pm.supplier_cost_usd
    from public.provider_offer_mappings pm
    where pm.offer_id = oi.offer_id
    order by pm.created_at, pm.id
    limit 1
  ) m on true
  where o.payment_status = 'paid'
    and oi.created_at >= v_month_start;

  return jsonb_build_object(
    'catalog', v_catalog,
    'attention', v_attention,
    'sales', v_sales,
    'earnings', v_earnings
  );
end;
$$;


revoke all on function public.admin_overview_snapshot(integer) from public;
grant execute on function public.admin_overview_snapshot(integer) to authenticated;

comment on function public.admin_overview_snapshot(integer) is 'Admin dashboard catalog counters, attention counters, sales KPIs and earnings in one call.';

-- Remove the parallel RPCs introduced by the cutover migration. They bypassed
-- the established checkout contracts above and are not application APIs.
revoke all on function public.wallet_checkout(uuid, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function public.gift_checkout(uuid, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_overview()
  from public, anon, authenticated, service_role;

drop function if exists public.wallet_checkout(uuid, integer, text);
drop function if exists public.gift_checkout(uuid, integer, text);
drop function if exists public.admin_overview();
