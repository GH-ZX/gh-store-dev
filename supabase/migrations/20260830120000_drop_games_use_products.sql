-- Finalize the products migration: add missing columns, sync data,
-- retarget foreign keys, drop sync triggers, and remove the games table.

-- 1. Add game-specific columns that products is missing
alter table public.products
  add column if not exists points_name_ar text,
  add column if not exists points_name_en text,
  add column if not exists carousel_badge_ar text,
  add column if not exists carousel_badge_en text,
  add column if not exists carousel_focus_x numeric(5, 2) not null default 50,
  add column if not exists carousel_focus_y numeric(5, 2) not null default 50,
  add column if not exists show_in_carousel boolean not null default false,
  add column if not exists carousel_order integer,
  add column if not exists carousel_color text;

-- 2. Sync all data from games into products (idempotent)
update public.products p set
  points_name_ar    = g.points_name_ar,
  points_name_en    = g.points_name_en,
  carousel_badge_ar = g.carousel_badge_ar,
  carousel_badge_en = g.carousel_badge_en,
  carousel_focus_x  = g.carousel_focus_x,
  carousel_focus_y  = g.carousel_focus_y,
  show_in_carousel  = g.show_in_carousel,
  carousel_order    = g.carousel_order,
  carousel_color    = g.carousel_color,
  category_id       = g.category_id,
  slug              = g.slug,
  name_ar           = g.name_ar,
  name_en           = g.name_en,
  description_ar    = g.description_ar,
  description_en    = g.description_en,
  image_url         = g.image_url,
  logo_url          = g.logo_url,
  is_active         = g.is_active,
  is_featured       = g.is_featured,
  sort_order        = g.sort_order,
  updated_at        = g.updated_at
from public.games g
where p.id = g.id;

-- 3. Retarget game_regions FK from games → products
alter table public.game_regions
  drop constraint if exists game_regions_game_id_fkey;

alter table public.game_regions
  add constraint game_regions_product_id_fkey
  foreign key (game_id) references public.products (id) on delete cascade;

-- 4. Retarget game_input_fields FK from games → products
alter table public.game_input_fields
  drop constraint if exists game_input_fields_game_id_fkey;

alter table public.game_input_fields
  add constraint game_input_fields_product_id_fkey
  foreign key (game_id) references public.products (id) on delete cascade;

-- 5. Drop legacy game_id column from offers (product_id is already populated)
--    Must drop the trigger first since it depends on game_id
drop trigger if exists offers_sync_product_reference on public.offers;
drop function if exists public.sync_offer_product_reference();

alter table public.offers
  drop constraint if exists offers_game_id_fkey;

alter table public.offers
  drop column if exists game_id;

-- 6. Update RLS policies on game_regions to reference products
drop policy if exists game_regions_select_public_active on public.game_regions;
create policy game_regions_select_public_active
on public.game_regions
for select
to anon, authenticated
using (
  is_active = true
  and exists (
    select 1 from public.products
    where products.id = game_regions.game_id
      and products.is_active = true
  )
);

-- 7. Update RLS policies on game_input_fields to reference products
drop policy if exists game_input_fields_select_public_active on public.game_input_fields;
create policy game_input_fields_select_public_active
on public.game_input_fields
for select
to anon, authenticated
using (
  exists (
    select 1 from public.products
    where products.id = game_input_fields.game_id
      and products.is_active = true
  )
);

-- 8. Drop sync triggers (no longer needed)
drop trigger if exists games_sync_product on public.games;
drop trigger if exists products_sync_game on public.products;

-- 9. Drop sync functions
drop function if exists public.sync_game_to_product();
drop function if exists public.sync_product_to_game();

-- 10. Recreate the offer sync trigger without game_id dependency
-- (product_id is now the sole reference; game_id no longer exists)
create or replace function public.enforce_offer_product()
returns trigger
language plpgsql
as $$
begin
  if new.product_id is null then
    raise exception 'An offer must belong to a product';
  end if;
  return new;
end;
$$;

create trigger offers_enforce_product
before insert or update of product_id on public.offers
for each row
execute function public.enforce_offer_product();

-- 11. Update wallet checkout RPC: games → products
create or replace function public.wallet_checkout(
  p_offer_id uuid,
  p_quantity integer default 1,
  p_customer_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_offer record;
  v_unit_price numeric;
  v_total numeric;
  v_wallet_id uuid;
  v_before numeric;
  v_after numeric;
  v_order_id uuid;
  v_order_number bigint;
  v_item_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  if p_quantity < 1 then
    raise exception 'Quantity must be at least 1' using errcode = 'P0001';
  end if;

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
    v_order_id, v_offer.id, v_offer.name_ar, v_offer.name_en,
    v_unit_price, p_quantity, v_total, '{}'::jsonb, '{}'::jsonb
  )
  returning id into v_item_id;

  update public.wallets
  set balance = v_after, updated_at = timezone('utc', now())
  where id = v_wallet_id;

  insert into public.wallet_transactions (
    wallet_id, type, amount, balance_before, balance_after, order_id, description
  )
  values (
    v_wallet_id, 'debit', v_total, v_before, v_after, v_order_id,
    'Wallet checkout'
  );

  update public.orders
  set status = 'completed', payment_status = 'paid', updated_at = timezone('utc', now())
  where id = v_order_id;

  return jsonb_build_object(
    'orderId', v_order_id,
    'orderNumber', v_order_number,
    'itemId', v_item_id,
    'total', v_total,
    'balanceAfter', v_after
  );
end;
$$;

-- 12. Update gift checkout RPC: games → products
create or replace function public.gift_checkout(
  p_offer_id uuid,
  p_quantity integer default 1,
  p_customer_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_offer record;
  v_unit_price numeric;
  v_total numeric;
  v_order_id uuid;
  v_order_number bigint;
  v_item_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  if p_quantity < 1 then
    raise exception 'Quantity must be at least 1' using errcode = 'P0001';
  end if;

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

  insert into public.orders (
    user_id, status, payment_status, payment_method, currency,
    subtotal, discount, total, customer_note
  )
  values (
    v_user_id, 'pending', 'pending', 'gift', v_offer.currency,
    v_total, 0, v_total, nullif(btrim(coalesce(p_customer_note, '')), '')
  )
  returning id, orders.order_number into v_order_id, v_order_number;

  insert into public.order_items (
    order_id, offer_id, name_ar_snapshot, name_en_snapshot,
    unit_price, quantity, total_price, dynamic_fields, metadata
  )
  values (
    v_order_id, v_offer.id, v_offer.name_ar, v_offer.name_en,
    v_unit_price, p_quantity, v_total, '{}'::jsonb, '{}'::jsonb
  )
  returning id into v_item_id;

  update public.orders
  set status = 'completed', payment_status = 'paid', updated_at = timezone('utc', now())
  where id = v_order_id;

  return jsonb_build_object(
    'orderId', v_order_id,
    'orderNumber', v_order_number,
    'itemId', v_item_id,
    'total', v_total
  );
end;
$$;

-- 13. Update admin overview counters RPC: games → products
create or replace function public.admin_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_catalog jsonb;
  v_attention jsonb;
  v_sales jsonb;
  v_earnings jsonb;
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Administrator access required' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'products', (select count(*) from public.products),
    'active_products', (select count(*) from public.products where is_active),
    'offers', (select count(*) from public.offers),
    'active_offers', (select count(*) from public.offers where is_active),
    'orders', (select count(*) from public.orders),
    'customers', (select count(*) from public.profiles where role = 'customer')
  )
  into v_catalog;

  select jsonb_build_object(
    'pending_orders', (select count(*) from public.orders where status = 'pending'),
    'pending_payments', (select count(*) from public.orders where payment_status = 'pending'),
    'failed_payments', (select count(*) from public.orders where payment_status = 'failed'),
    'low_stock', (select count(*) from public.stock_items where quantity_remaining <= 5 and is_active = true)
  )
  into v_attention;

  select jsonb_build_object(
    'today_orders', (select count(*) from public.orders where created_at >= current_date),
    'today_revenue', (select coalesce(sum(total), 0) from public.orders where status = 'completed' and created_at >= current_date),
    'month_orders', (select count(*) from public.orders where created_at >= date_trunc('month', current_date)),
    'month_revenue', (select coalesce(sum(total), 0) from public.orders where status = 'completed' and created_at >= date_trunc('month', current_date))
  )
  into v_sales;

  select jsonb_build_object(
    'wallet_balance', (select coalesce(sum(balance), 0) from public.wallets),
    'total_deposits', (select coalesce(sum(amount), 0) from public.wallet_transactions where type = 'credit'),
    'total_withdrawals', (select coalesce(sum(amount), 0) from public.wallet_transactions where type = 'debit')
  )
  into v_earnings;

  return jsonb_build_object(
    'catalog', v_catalog,
    'attention', v_attention,
    'sales', v_sales,
    'earnings', v_earnings
  );
end;
$$;

-- 14. Update search index references
drop index if exists public.games_search_trgm_idx;
drop index if exists public.games_active_sort_idx;

create extension if not exists pg_trgm with schema extensions;

create index if not exists products_search_trgm_idx
  on public.products using gin (
    name_en extensions.gin_trgm_ops,
    name_ar extensions.gin_trgm_ops,
    description_en extensions.gin_trgm_ops,
    description_ar extensions.gin_trgm_ops
  );

-- 15. Retarget provider_game_mappings FK from games → products
alter table public.provider_game_mappings
  drop constraint if exists provider_game_mappings_game_id_fkey;

alter table public.provider_game_mappings
  add constraint provider_game_mappings_product_id_fkey
  foreign key (game_id) references public.products (id) on delete cascade;

-- 16. Drop the games table (cascades to indexes, triggers, policies)
drop table if exists public.games cascade;

-- 17. Update grants
grant select on public.categories, public.game_regions,
  public.game_input_fields, public.offers, public.provider_game_mappings to anon, authenticated;
grant select, insert, update, delete on public.categories,
  public.game_regions, public.game_input_fields, public.offers,
  public.provider_game_mappings, public.provider_offer_mappings to authenticated;
