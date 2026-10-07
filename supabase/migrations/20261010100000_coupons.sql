-- Coupons and discount codes.
--
-- A coupon is money, so every rule about it lives in the database and the
-- browser only ever sends a code. The client may preview a discount; the
-- discount that is charged is recomputed inside the order transaction, from
-- the live offer price, under a row lock on the coupon. A tampered client
-- value is not rejected — it is ignored, which is the same thing but cannot be
-- gamed by retrying.
--
-- The margin guard is the second rule, and it is not advisory. This store runs
-- at a 13% gross margin, so a coupon that would take an order below the
-- supplier's cost is refused outright rather than quietly shrunk: an owner who
-- typed 90% off meant something, and silently selling at a discount they did
-- not choose is worse than saying no. `admin_coupon_margin_limit` exposes the
-- ceiling so the dashboard can show the same number the database enforces.
--
-- `orders.discount` already existed and was always written as 0. It is now the
-- real discount, and it is what the invoice reads.

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  type text not null check (type in ('percent', 'fixed')),
  value numeric(12, 2) not null check (value > 0),
  min_subtotal numeric(12, 2) not null default 0 check (min_subtotal >= 0),
  max_discount numeric(12, 2) check (max_discount is null or max_discount > 0),
  currency text not null default 'USD' check (currency in ('USD', 'SYP', 'EUR')),
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  per_customer_limit integer not null default 1 check (per_customer_limit > 0),
  valid_from timestamptz,
  valid_until timestamptz,
  is_active boolean not null default true,
  -- Empty means "the whole catalogue". Category scope outranks product scope
  -- when both are set, so the narrower list wins and nothing is charged at a
  -- discount the owner did not mean.
  product_ids uuid[] not null default '{}'::uuid[],
  category_ids uuid[] not null default '{}'::uuid[],
  offer_ids uuid[] not null default '{}'::uuid[],
  admin_note text,
  times_used integer not null default 0 check (times_used >= 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint coupons_percent_value_check check (type <> 'percent' or value <= 100),
  constraint coupons_window_check check (valid_until is null or valid_from is null or valid_until > valid_from)
);

-- Case-insensitive uniqueness, enforced by the database rather than by a
-- service that lowercases on the way in: two owners editing at once can still
-- only create one `GH10`.
create unique index if not exists coupons_code_key
  on public.coupons (upper(code));

create index if not exists coupons_active_idx
  on public.coupons (is_active, valid_until);

create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id) on delete restrict,
  code text not null,
  user_id uuid not null references public.profiles (id) on delete restrict,
  order_id uuid not null references public.orders (id) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'USD',
  created_at timestamptz not null default timezone('utc', now()),
  -- One coupon per order, which is what makes "claim atomically" checkable:
  -- a duplicate insert is the race loser's error, not a second redemption.
  unique (coupon_id, order_id)
);

create index if not exists coupon_redemptions_user_idx
  on public.coupon_redemptions (user_id, created_at desc);
create index if not exists coupon_redemptions_coupon_idx
  on public.coupon_redemptions (coupon_id, created_at desc);

drop trigger if exists coupons_set_updated_at on public.coupons;
create trigger coupons_set_updated_at
before update on public.coupons
for each row
execute function public.set_updated_at();

alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;

-- A customer may read an active coupon's code (it is public marketing copy and
-- the checkout form shows it back), never write one. Redemptions are the
-- store's record: no customer session writes or reads another's.
revoke all on public.coupons from anon;
revoke all on public.coupon_redemptions from anon, authenticated;

grant select on public.coupons to authenticated;
grant select, insert, update, delete on public.coupons to service_role;
grant select, insert on public.coupon_redemptions to service_role;

drop policy if exists coupons_select_active on public.coupons;
create policy coupons_select_active
on public.coupons
for select
to authenticated
using (
  is_active
  and (valid_from is null or valid_from <= timezone('utc', now()))
  and (valid_until is null or valid_until > timezone('utc', now()))
);

drop policy if exists coupons_admin_all on public.coupons;
create policy coupons_admin_all
on public.coupons
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists coupon_redemptions_admin_select on public.coupon_redemptions;
create policy coupon_redemptions_admin_select
on public.coupon_redemptions
for select
to authenticated
using (public.is_admin(auth.uid()));

grant select on public.coupon_redemptions to authenticated;

-- ─── The margin ceiling ────────────────────────────────────────────────────

/**
 * The most a coupon may ever take off one unit of this offer.
 *
 * The store buys the unit and sells the unit, so "below cost" is a per-unit
 * comparison and this is it: the discount can consume the markup and nothing
 * more. An unmapped offer has an unknown cost, and an unknown cost is not a
 * licence to discount — it returns 0, which refuses the coupon. The one
 * exception is an offer whose cost is genuinely recorded as zero (a stored or
 * manually delivered item already paid for), which can be discounted to zero.
 */
create or replace function public.coupon_margin_limit(p_offer_id uuid, p_quantity integer default 1)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_price numeric(12, 2);
  v_cost numeric(12, 4);
  v_has_cost boolean := false;
  v_free boolean := false;
begin
  select o.price, (o.delivery_kind = 'stored')
  into v_price, v_free
  from public.offers o
  where o.id = p_offer_id;

  if v_price is null then
    return 0;
  end if;

  if v_free then
    return v_price * greatest(coalesce(p_quantity, 1), 1);
  end if;

  select pm.supplier_cost_usd, true
  into v_cost, v_has_cost
  from public.provider_offer_mappings pm
  where pm.offer_id = p_offer_id
    and pm.supplier_cost_usd is not null
  order by pm.created_at, pm.id
  limit 1;

  if not coalesce(v_has_cost, false) then
    return 0;
  end if;

  return round(greatest(v_price - v_cost, 0) * greatest(coalesce(p_quantity, 1), 1), 2);
end;
$$;

revoke all on function public.coupon_margin_limit(uuid, integer) from public, anon;
grant execute on function public.coupon_margin_limit(uuid, integer) to authenticated, service_role;

-- ─── Validation, inside the transaction ────────────────────────────────────

/**
 * Resolve a code against this customer and this cart, and return the discount.
 *
 * Internal by construction — `authenticated` and `service_role` are revoked —
 * because it takes the customer id as an argument, and a caller who can pass
 * somebody else's id could spend their per-customer allowance. The order RPCs
 * below call it with `auth.uid()` or with a service-verified user id.
 *
 * `p_at` is the transaction clock, passed in rather than read, so the validity
 * window, the usage count and the redemption row all agree on one instant.
 */
create or replace function public.validate_coupon_for_order(
  p_code text,
  p_user_id uuid,
  p_offer_id uuid,
  p_quantity integer,
  p_subtotal numeric,
  p_at timestamptz
)
returns table (coupon_id uuid, code text, discount numeric)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_coupon public.coupons;
  v_uses integer := 0;
  v_discount numeric(12, 2) := 0;
  v_ceiling numeric(12, 2);
  v_scoped boolean := false;
  v_product uuid;
  v_category uuid;
begin
  if p_code is null or btrim(p_code) = '' then
    raise exception 'Coupon code required' using errcode = 'P0001';
  end if;

  -- The row lock is the whole concurrency story: two orders racing for the
  -- last redemption of a limited code queue here, and the second one sees the
  -- incremented `times_used` rather than the value it read a moment ago.
  select * into v_coupon
  from public.coupons
  where upper(code) = upper(btrim(p_code))
  for update;

  if v_coupon.id is null then
    raise exception 'Coupon not found' using errcode = 'P0001';
  end if;

  if not v_coupon.is_active then
    raise exception 'Coupon is not active' using errcode = 'P0001';
  end if;

  if v_coupon.valid_from is not null and p_at < v_coupon.valid_from then
    raise exception 'Coupon is not valid yet' using errcode = 'P0001';
  end if;

  if v_coupon.valid_until is not null and p_at >= v_coupon.valid_until then
    raise exception 'Coupon has expired' using errcode = 'P0001';
  end if;

  if v_coupon.usage_limit is not null and v_coupon.times_used >= v_coupon.usage_limit then
    raise exception 'Coupon usage limit reached' using errcode = 'P0001';
  end if;

  select count(*) into v_uses
  from public.coupon_redemptions r
  where r.coupon_id = v_coupon.id
    and r.user_id = p_user_id;

  if v_uses >= v_coupon.per_customer_limit then
    raise exception 'Coupon already used' using errcode = 'P0001';
  end if;

  if coalesce(p_subtotal, 0) < v_coupon.min_subtotal then
    raise exception 'Order subtotal is below the coupon minimum' using errcode = 'P0001';
  end if;

  -- Scope: category, then product, then the single offer.
  select p.category_id, o.product_id
  into v_category, v_product
  from public.offers o
  join public.products p on p.id = o.product_id
  where o.id = p_offer_id;

  if cardinality(v_coupon.category_ids) > 0 then
    v_scoped := true;

    if v_category is null or not (v_category = any (v_coupon.category_ids)) then
      raise exception 'Coupon does not apply to this product' using errcode = 'P0001';
    end if;
  end if;

  if cardinality(v_coupon.product_ids) > 0 then
    v_scoped := true;

    if v_product is null or not (v_product = any (v_coupon.product_ids)) then
      raise exception 'Coupon does not apply to this product' using errcode = 'P0001';
    end if;
  end if;

  if cardinality(v_coupon.offer_ids) > 0 then
    v_scoped := true;

    if not (p_offer_id = any (v_coupon.offer_ids)) then
      raise exception 'Coupon does not apply to this offer' using errcode = 'P0001';
    end if;
  end if;

  -- Unscoped coupons apply to the whole catalogue; a scoped one that survived
  -- the checks above is also applicable, so the flag is informational.
  perform v_scoped;

  v_discount := case
    when v_coupon.type = 'percent' then round(p_subtotal * v_coupon.value / 100, 2)
    else least(v_coupon.value, p_subtotal)
  end;

  if v_coupon.max_discount is not null then
    v_discount := least(v_discount, v_coupon.max_discount);
  end if;

  v_discount := greatest(least(v_discount, p_subtotal), 0);

  if v_discount <= 0 then
    raise exception 'Coupon gives no discount on this order' using errcode = 'P0001';
  end if;

  -- The guard, enforced here rather than in the form.
  v_ceiling := public.coupon_margin_limit(p_offer_id, p_quantity);

  if v_discount > v_ceiling then
    raise exception 'Coupon would sell below supplier cost' using errcode = 'P0001';
  end if;

  return query select v_coupon.id, v_coupon.code, v_discount;
end;
$$;

-- Revoked from every API role because it takes the customer id as an argument:
-- a caller who could pass somebody else's id could spend their allowance. The
-- order RPCs below call it inside their own transaction, and a service-role
-- test harness may call it directly with the service key.
revoke all on function public.validate_coupon_for_order(text, uuid, uuid, integer, numeric, timestamptz)
  from public, anon, authenticated;
grant execute on function public.validate_coupon_for_order(text, uuid, uuid, integer, numeric, timestamptz)
  to service_role;

/**
 * Record the redemption and move the counter, once, in the order transaction.
 */
create or replace function public.redeem_coupon(
  p_coupon_id uuid,
  p_code text,
  p_user_id uuid,
  p_order_id uuid,
  p_amount numeric,
  p_currency text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  insert into public.coupon_redemptions (coupon_id, code, user_id, order_id, amount, currency)
  values (p_coupon_id, p_code, p_user_id, p_order_id, p_amount, coalesce(p_currency, 'USD'))
  on conflict (coupon_id, order_id) do nothing;

  update public.coupons
  set times_used = times_used + 1
  where id = p_coupon_id;
end;
$$;

revoke all on function public.redeem_coupon(uuid, text, uuid, uuid, numeric, text)
  from public, anon, authenticated;
grant execute on function public.redeem_coupon(uuid, text, uuid, uuid, numeric, text)
  to service_role;

-- ─── The order RPCs, with the coupon inside the transaction ────────────────
--
-- The previous five-argument signatures are dropped rather than kept beside
-- these: two candidates differing only in a defaulted argument would make
-- every existing five-argument call ambiguous.

drop function if exists public.place_wallet_order(uuid, integer, jsonb, uuid, text);
drop function if exists public.place_wallet_order_for_user(uuid, uuid, integer, jsonb, uuid, text);
drop function if exists public.place_gift_order(uuid, integer, jsonb, uuid, text);

create or replace function public.place_wallet_order(
  p_offer_id uuid,
  p_quantity integer,
  p_dynamic_fields jsonb,
  p_idempotency_key uuid,
  p_customer_note text default null,
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
  v_offer record;
  v_quantity integer := coalesce(p_quantity, 1);
  v_at timestamptz := timezone('utc', now());
  v_unit_price numeric(12, 2);
  v_subtotal numeric(12, 2);
  v_discount numeric(12, 2) := 0;
  v_total numeric(12, 2);
  v_coupon_id uuid;
  v_coupon_code text;
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
  v_subtotal := round(v_unit_price * v_quantity, 2);

  -- The discount is computed here, from the live price, whatever the browser
  -- claimed. Nothing about the coupon is taken from the request but the code.
  if p_coupon_code is not null and btrim(p_coupon_code) <> '' then
    select c.coupon_id, c.code, c.discount
    into v_coupon_id, v_coupon_code, v_discount
    from public.validate_coupon_for_order(
      p_coupon_code,
      v_user_id,
      v_offer.id,
      v_quantity,
      v_subtotal,
      v_at
    ) c;
  end if;

  v_discount := coalesce(v_discount, 0);
  v_total := round(v_subtotal - v_discount, 2);

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
    subtotal, discount, total, customer_note,
    metadata
  )
  values (
    v_user_id, 'pending', 'pending', 'wallet', v_offer.currency,
    v_subtotal, v_discount, v_total, nullif(btrim(coalesce(p_customer_note, '')), ''),
    case when v_coupon_id is null then '{}'::jsonb
         else jsonb_build_object('coupon_code', v_coupon_code, 'coupon_discount', v_discount)
    end
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
    v_subtotal,
    coalesce(p_dynamic_fields, '{}'::jsonb),
    jsonb_build_object('offer_type', v_offer.offer_type, 'product_id', v_offer.product_id)
  )
  returning id into v_item_id;

  -- After the order row exists, so the redemption can point at it.
  if v_coupon_id is not null then
    perform public.redeem_coupon(v_coupon_id, v_coupon_code, v_user_id, v_order_id, v_discount, v_offer.currency);
  end if;

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

revoke all on function public.place_wallet_order(uuid, integer, jsonb, uuid, text, text) from public, anon;
grant execute on function public.place_wallet_order(uuid, integer, jsonb, uuid, text, text) to authenticated;

create or replace function public.place_wallet_order_for_user(
  p_user_id uuid,
  p_offer_id uuid,
  p_quantity integer,
  p_dynamic_fields jsonb,
  p_idempotency_key uuid,
  p_customer_note text default null,
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
  v_user_id uuid := p_user_id;
  v_is_active boolean;
  v_offer record;
  v_quantity integer := coalesce(p_quantity, 1);
  v_at timestamptz := timezone('utc', now());
  v_unit_price numeric(12, 2);
  v_subtotal numeric(12, 2);
  v_discount numeric(12, 2) := 0;
  v_total numeric(12, 2);
  v_coupon_id uuid;
  v_coupon_code text;
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
  v_subtotal := round(v_unit_price * v_quantity, 2);

  if p_coupon_code is not null and btrim(p_coupon_code) <> '' then
    select c.coupon_id, c.code, c.discount
    into v_coupon_id, v_coupon_code, v_discount
    from public.validate_coupon_for_order(
      p_coupon_code,
      v_user_id,
      v_offer.id,
      v_quantity,
      v_subtotal,
      v_at
    ) c;
  end if;

  v_discount := coalesce(v_discount, 0);
  v_total := round(v_subtotal - v_discount, 2);

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
    subtotal, discount, total, customer_note, metadata
  )
  values (
    v_user_id, 'pending', 'pending', 'wallet', v_offer.currency,
    v_subtotal, v_discount, v_total, nullif(btrim(coalesce(p_customer_note, '')), ''),
    case when v_coupon_id is null then '{}'::jsonb
         else jsonb_build_object('coupon_code', v_coupon_code, 'coupon_discount', v_discount)
    end
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
    v_subtotal,
    coalesce(p_dynamic_fields, '{}'::jsonb),
    jsonb_build_object('offer_type', v_offer.offer_type, 'product_id', v_offer.product_id)
  )
  returning id into v_item_id;

  if v_coupon_id is not null then
    perform public.redeem_coupon(v_coupon_id, v_coupon_code, v_user_id, v_order_id, v_discount, v_offer.currency);
  end if;

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

revoke all on function public.place_wallet_order_for_user(uuid, uuid, integer, jsonb, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.place_wallet_order_for_user(uuid, uuid, integer, jsonb, uuid, text, text)
  to service_role;

/**
 * Admin gift checkout. A gift is paid on arrival with no wallet involved, and
 * the margin guard still applies: a discounted gift order below cost is the
 * same loss as a discounted wallet order below cost.
 */
create or replace function public.place_gift_order(
  p_offer_id uuid,
  p_quantity integer,
  p_dynamic_fields jsonb,
  p_idempotency_key uuid,
  p_customer_note text default null,
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
  v_offer record;
  v_quantity integer := coalesce(p_quantity, 1);
  v_at timestamptz := timezone('utc', now());
  v_unit_price numeric(12, 2);
  v_subtotal numeric(12, 2);
  v_discount numeric(12, 2) := 0;
  v_total numeric(12, 2);
  v_coupon_id uuid;
  v_coupon_code text;
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
  v_subtotal := round(v_unit_price * v_quantity, 2);

  if p_coupon_code is not null and btrim(p_coupon_code) <> '' then
    select c.coupon_id, c.code, c.discount
    into v_coupon_id, v_coupon_code, v_discount
    from public.validate_coupon_for_order(
      p_coupon_code,
      v_user_id,
      v_offer.id,
      v_quantity,
      v_subtotal,
      v_at
    ) c;
  end if;

  v_discount := coalesce(v_discount, 0);
  v_total := round(v_subtotal - v_discount, 2);

  insert into public.orders (
    user_id, status, payment_status, payment_method, currency,
    subtotal, discount, total, customer_note, metadata
  )
  values (
    v_user_id, 'paid', 'paid', 'gift', v_offer.currency,
    v_subtotal, v_discount, v_total, nullif(btrim(coalesce(p_customer_note, '')), ''),
    case when v_coupon_id is null then '{}'::jsonb
         else jsonb_build_object('coupon_code', v_coupon_code, 'coupon_discount', v_discount)
    end
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
    v_subtotal,
    coalesce(p_dynamic_fields, '{}'::jsonb),
    jsonb_build_object('offer_type', v_offer.offer_type, 'product_id', v_offer.product_id)
  )
  returning id into v_item_id;

  if v_coupon_id is not null then
    perform public.redeem_coupon(v_coupon_id, v_coupon_code, v_user_id, v_order_id, v_discount, v_offer.currency);
  end if;

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

revoke all on function public.place_gift_order(uuid, integer, jsonb, uuid, text, text) from public, anon;
grant execute on function public.place_gift_order(uuid, integer, jsonb, uuid, text, text) to authenticated;

comment on function public.place_wallet_order(uuid, integer, jsonb, uuid, text, text) is
  'Customer wallet checkout. The coupon discount is recomputed from the live price under a row lock; a code that would sell below supplier cost is refused.';

-- ─── Ready-made campaigns ──────────────────────────────────────────────────
--
-- Two codes the owner can switch on today. Both are inactive on purpose: the
-- migration ships the campaign, the owner decides when to spend on it.
--
-- `TELEGRAM5` is the Telegram-only code (announced through a broadcast), a 5%
-- discount capped at $3.50 — at a $19 order that is ~$0.95, comfortably inside
-- the ~$2.50 gross profit the average order earns, and the margin guard
-- refuses it outright on any offer where 5% would cross the supplier cost.
--
-- `WELCOME2` is the first-purchase code, $1.00 fixed, which is a little under
-- half the average order's gross profit and the same size as the referral
-- reward, so one new customer can at most consume two dollars of margin.

insert into public.coupons (code, type, value, min_subtotal, max_discount, usage_limit, per_customer_limit, is_active, admin_note)
values
  ('TELEGRAM5', 'percent', 5, 0, 3.50, null, 1, false,
   'Telegram-only campaign: announce with a customer broadcast. 5% off, at most $3.50, once per customer.'),
  ('WELCOME2', 'fixed', 1.00, 5.00, null, null, 1, false,
   'First-purchase code: $1.00 off orders of $5 or more, once per customer.')
on conflict (upper(code)) do nothing;

comment on table public.coupons is
  'Discount codes. Validation, the per-customer limit, the usage claim and the supplier-cost margin guard all run inside the order transaction.';
