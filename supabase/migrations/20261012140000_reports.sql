-- 20261012140000_reports.sql
-- Admin sales reports RPC returning revenue, cost, profit, and order metrics grouped by dimension.

create or replace function public.admin_sales_report(
  p_from date default (current_date - interval '30 days')::date,
  p_to date default current_date,
  p_group text default 'day'
)
returns table (
  group_key text,
  group_label text,
  orders_count bigint,
  items_count bigint,
  revenue numeric,
  cost numeric,
  profit numeric,
  margin_percent numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_from_ts timestamptz := p_from::timestamptz;
  v_to_ts timestamptz := (p_to + interval '1 day')::timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_user_id;

  if v_role is distinct from 'admin' then
    raise exception 'Admin privileges required' using errcode = 'P0001';
  end if;

  if p_group = 'product' then
    return query
    select
      coalesce(p.id::text, 'unknown') as group_key,
      coalesce(p.name_en, p.name_ar, 'Unknown product') as group_label,
      count(distinct o.id) as orders_count,
      coalesce(sum(oi.quantity), 0)::bigint as items_count,
      round(coalesce(sum(oi.total_price), 0), 2) as revenue,
      round(coalesce(sum(coalesce(m.supplier_cost_usd, 0) * oi.quantity), 0), 2) as cost,
      round(coalesce(sum(oi.total_price), 0) - coalesce(sum(coalesce(m.supplier_cost_usd, 0) * oi.quantity), 0), 2) as profit,
      case
        when coalesce(sum(oi.total_price), 0) > 0 then
          round(((coalesce(sum(oi.total_price), 0) - coalesce(sum(coalesce(m.supplier_cost_usd, 0) * oi.quantity), 0)) / sum(oi.total_price) * 100), 1)
        else 0
      end as margin_percent
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.offers off on off.id = oi.offer_id
    left join public.products p on p.id = off.product_id
    left join lateral (
      select pm.supplier_cost_usd
      from public.provider_offer_mappings pm
      where pm.offer_id = oi.offer_id
      order by pm.created_at, pm.id
      limit 1
    ) m on true
    where o.payment_status = 'paid'
      and o.created_at >= v_from_ts
      and o.created_at < v_to_ts
    group by p.id, p.name_en, p.name_ar
    order by revenue desc;

  elsif p_group = 'category' then
    return query
    select
      coalesce(c.slug, 'uncategorized') as group_key,
      coalesce(c.name_en, c.name_ar, 'Uncategorized') as group_label,
      count(distinct o.id) as orders_count,
      coalesce(sum(oi.quantity), 0)::bigint as items_count,
      round(coalesce(sum(oi.total_price), 0), 2) as revenue,
      round(coalesce(sum(coalesce(m.supplier_cost_usd, 0) * oi.quantity), 0), 2) as cost,
      round(coalesce(sum(oi.total_price), 0) - coalesce(sum(coalesce(m.supplier_cost_usd, 0) * oi.quantity), 0), 2) as profit,
      case
        when coalesce(sum(oi.total_price), 0) > 0 then
          round(((coalesce(sum(oi.total_price), 0) - coalesce(sum(coalesce(m.supplier_cost_usd, 0) * oi.quantity), 0)) / sum(oi.total_price) * 100), 1)
        else 0
      end as margin_percent
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.offers off on off.id = oi.offer_id
    left join public.products p on p.id = off.product_id
    left join public.categories c on c.id = p.category_id
    left join lateral (
      select pm.supplier_cost_usd
      from public.provider_offer_mappings pm
      where pm.offer_id = oi.offer_id
      order by pm.created_at, pm.id
      limit 1
    ) m on true
    where o.payment_status = 'paid'
      and o.created_at >= v_from_ts
      and o.created_at < v_to_ts
    group by c.slug, c.name_en, c.name_ar
    order by revenue desc;

  elsif p_group = 'provider' then
    return query
    select
      coalesce(m.provider_name, 'manual') as group_key,
      case
        when m.provider_name is not null then upper(m.provider_name)
        else 'Manual / Internal'
      end as group_label,
      count(distinct o.id) as orders_count,
      coalesce(sum(oi.quantity), 0)::bigint as items_count,
      round(coalesce(sum(oi.total_price), 0), 2) as revenue,
      round(coalesce(sum(coalesce(m.supplier_cost_usd, 0) * oi.quantity), 0), 2) as cost,
      round(coalesce(sum(oi.total_price), 0) - coalesce(sum(coalesce(m.supplier_cost_usd, 0) * oi.quantity), 0), 2) as profit,
      case
        when coalesce(sum(oi.total_price), 0) > 0 then
          round(((coalesce(sum(oi.total_price), 0) - coalesce(sum(coalesce(m.supplier_cost_usd, 0) * oi.quantity), 0)) / sum(oi.total_price) * 100), 1)
        else 0
      end as margin_percent
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join lateral (
      select pm.provider_name, pm.supplier_cost_usd
      from public.provider_offer_mappings pm
      where pm.offer_id = oi.offer_id
      order by pm.created_at, pm.id
      limit 1
    ) m on true
    where o.payment_status = 'paid'
      and o.created_at >= v_from_ts
      and o.created_at < v_to_ts
    group by m.provider_name
    order by revenue desc;

  else
    -- Default: day
    return query
    select
      to_char(date_trunc('day', o.created_at), 'YYYY-MM-DD') as group_key,
      to_char(date_trunc('day', o.created_at), 'YYYY-MM-DD') as group_label,
      count(distinct o.id) as orders_count,
      coalesce(sum(oi.quantity), 0)::bigint as items_count,
      round(coalesce(sum(oi.total_price), 0), 2) as revenue,
      round(coalesce(sum(coalesce(m.supplier_cost_usd, 0) * oi.quantity), 0), 2) as cost,
      round(coalesce(sum(oi.total_price), 0) - coalesce(sum(coalesce(m.supplier_cost_usd, 0) * oi.quantity), 0), 2) as profit,
      case
        when coalesce(sum(oi.total_price), 0) > 0 then
          round(((coalesce(sum(oi.total_price), 0) - coalesce(sum(coalesce(m.supplier_cost_usd, 0) * oi.quantity), 0)) / sum(oi.total_price) * 100), 1)
        else 0
      end as margin_percent
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
      and o.created_at >= v_from_ts
      and o.created_at < v_to_ts
    group by date_trunc('day', o.created_at)
    order by group_key desc;
  end if;
end;
$$;

revoke all on function public.admin_sales_report(date, date, text) from public, anon;
grant execute on function public.admin_sales_report(date, date, text) to authenticated;
