-- Coupon wallet recharge & balance redemption
--
-- Adds support for 'balance' coupon type, allowing admins to generate gift/recharge
-- coupons that authenticated customers can redeem directly into their wallet balance
-- at /redeem. Once redeemed (e.g. 1-time single use), it is immediately marked as used
-- and becomes unavailable.

-- 1. Support 'balance' type in coupons table
alter table public.coupons drop constraint if exists coupons_type_check;
alter table public.coupons add constraint coupons_type_check check (type in ('percent', 'fixed', 'balance'));

-- 2. Make order_id nullable in coupon_redemptions so wallet recharges (which have no order) can be recorded
alter table public.coupon_redemptions alter column order_id drop not null;

-- Partial unique index so a customer cannot redeem the same balance coupon multiple times
create unique index if not exists coupon_redemptions_wallet_key
  on public.coupon_redemptions (coupon_id, user_id)
  where order_id is null;

-- 3. Disallow balance coupons from being applied as order checkout discounts
create or replace function public.validate_coupon_for_order(
  p_code text,
  p_user_id uuid,
  p_offer_id uuid,
  p_subtotal numeric,
  p_quantity integer,
  p_at timestamptz default timezone('utc', now())
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

  if v_coupon.type = 'balance' then
    raise exception 'Balance coupons cannot be used as checkout discounts' using errcode = 'P0001';
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

  select p.category_id, o.product_id
  into v_category, v_product
  from public.offers o
  join public.products p on p.id = o.product_id
  where o.id = p_offer_id;

  if cardinality(v_coupon.category_ids) > 0 then
    v_scoped := true;
    if v_category is null or not (v_category = any(v_coupon.category_ids)) then
      raise exception 'Coupon not valid for this category' using errcode = 'P0001';
    end if;
  end if;

  if cardinality(v_coupon.product_ids) > 0 then
    v_scoped := true;
    if v_product is null or not (v_product = any(v_coupon.product_ids)) then
      raise exception 'Coupon not valid for this product' using errcode = 'P0001';
    end if;
  end if;

  if cardinality(v_coupon.offer_ids) > 0 then
    v_scoped := true;
    if not (p_offer_id = any(v_coupon.offer_ids)) then
      raise exception 'Coupon not valid for this offer' using errcode = 'P0001';
    end if;
  end if;

  if v_coupon.type = 'percent' then
    v_discount := round((coalesce(p_subtotal, 0) * v_coupon.value) / 100.0, 2);
  else
    v_discount := least(v_coupon.value, coalesce(p_subtotal, 0));
  end if;

  if v_coupon.max_discount is not null then
    v_discount := least(v_discount, v_coupon.max_discount);
  end if;

  v_discount := round(greatest(least(v_discount, coalesce(p_subtotal, 0)), 0), 2);

  if v_discount <= 0 then
    raise exception 'Coupon yields no discount' using errcode = 'P0001';
  end if;

  v_ceiling := public.coupon_margin_limit(p_offer_id, p_quantity);

  if v_discount > v_ceiling then
    raise exception 'Coupon discount exceeds safety margin' using errcode = 'P0001';
  end if;

  return query select v_coupon.id, v_coupon.code, v_discount;
end;
$$;

-- 4. Atomic function to redeem a balance coupon into user's wallet
create or replace function public.redeem_coupon_to_wallet(
  p_code text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_coupon public.coupons;
  v_uses integer := 0;
  v_wallet record;
  v_before numeric(12, 2);
  v_after numeric(12, 2);
  v_credit numeric(12, 2);
  v_redemption_id uuid := gen_random_uuid();
  v_idempotency_key uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  if p_code is null or btrim(p_code) = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  -- Lock coupon row for update
  select * into v_coupon
  from public.coupons
  where upper(code) = upper(btrim(p_code))
  for update;

  if v_coupon.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if not v_coupon.is_active then
    return jsonb_build_object('ok', false, 'error', 'inactive');
  end if;

  if v_coupon.type <> 'balance' then
    return jsonb_build_object('ok', false, 'error', 'discount_coupon_not_for_wallet');
  end if;

  if v_coupon.valid_from is not null and timezone('utc', now()) < v_coupon.valid_from then
    return jsonb_build_object('ok', false, 'error', 'not_started');
  end if;

  if v_coupon.valid_until is not null and timezone('utc', now()) >= v_coupon.valid_until then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  if v_coupon.usage_limit is not null and v_coupon.times_used >= v_coupon.usage_limit then
    return jsonb_build_object('ok', false, 'error', 'exhausted');
  end if;

  select count(*) into v_uses
  from public.coupon_redemptions r
  where r.coupon_id = v_coupon.id
    and r.user_id = v_user_id;

  if v_uses >= coalesce(v_coupon.per_customer_limit, 1) then
    return jsonb_build_object('ok', false, 'error', 'already_redeemed');
  end if;

  -- Lock or create wallet
  select w.id, w.balance into v_wallet
  from public.wallets w
  where w.user_id = v_user_id
  for update;

  if v_wallet.id is null then
    insert into public.wallets (user_id, balance, currency)
    values (v_user_id, 0.00, 'USD')
    returning id, balance into v_wallet;
  end if;

  v_credit := v_coupon.value;
  v_before := v_wallet.balance;
  v_after := round(v_before + v_credit, 2);
  v_idempotency_key := md5('coupon_wallet:' || v_coupon.id::text || ':' || v_user_id::text || ':' || coalesce(v_coupon.times_used, 0)::text)::uuid;

  -- Append to wallet ledger
  insert into public.wallet_transactions (
    wallet_id, user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, idempotency_key, description, metadata
  )
  values (
    v_wallet.id, v_user_id, 'deposit', v_credit,
    v_before, v_after, 'coupon_redeem', v_coupon.id,
    v_idempotency_key,
    'Redeemed coupon ' || v_coupon.code,
    jsonb_build_object('coupon_id', v_coupon.id, 'code', v_coupon.code, 'redemption_id', v_redemption_id)
  );

  -- Update wallet balance
  update public.wallets
  set balance = v_after, version = version + 1
  where id = v_wallet.id;

  -- Record redemption
  insert into public.coupon_redemptions (
    id, coupon_id, code, user_id, order_id, amount, currency
  )
  values (
    v_redemption_id, v_coupon.id, v_coupon.code, v_user_id, null, v_credit, v_coupon.currency
  );

  -- Update coupon usage count and auto-deactivate if exhausted (e.g. 1/1 use)
  update public.coupons
  set times_used = times_used + 1,
      is_active = case
        when usage_limit is not null and (times_used + 1) >= usage_limit then false
        else is_active
      end,
      updated_at = timezone('utc', now())
  where id = v_coupon.id;

  return jsonb_build_object(
    'ok', true,
    'amount', v_credit,
    'balance_after', v_after,
    'code', v_coupon.code
  );
end;
$$;

revoke all on function public.redeem_coupon_to_wallet(text) from public, anon;
grant execute on function public.redeem_coupon_to_wallet(text) to authenticated, service_role;
