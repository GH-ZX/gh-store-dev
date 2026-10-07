-- 1. Ensure coupon discounts preserve at least a 2% safety margin of the product price
create or replace function public.coupon_margin_limit(
  p_offer_id uuid,
  p_quantity integer default 1
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_price numeric;
  v_cost numeric;
  v_free boolean := false;
  v_has_cost boolean := false;
  v_min_margin numeric;
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

  -- Maintain at least a 2% margin on product price so store never sells at a loss
  v_min_margin := round(v_price * 0.02, 2);

  return round(greatest(v_price - v_cost - v_min_margin, 0) * greatest(coalesce(p_quantity, 1), 1), 2);
end;
$$;

revoke all on function public.coupon_margin_limit(uuid, integer) from public, anon;
grant execute on function public.coupon_margin_limit(uuid, integer) to authenticated, service_role;

-- 2. Lock down coupons table security: normal customers must NEVER read or list coupons
-- Drop open select policy for normal users if present
drop policy if exists coupons_select_active on public.coupons;

-- Ensure ONLY admins can read or write public.coupons
drop policy if exists coupons_admin_all on public.coupons;
create policy coupons_admin_all
on public.coupons
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));
