-- The admin overview's numbers, in one round trip.
--
-- The dashboard used to ask for its figures one PostgREST call at a time: six
-- head counts for the catalog line, four more for the "needs attention" strip,
-- four for the sales KPIs, two for earnings, and a two-hundred-row read of
-- `recharge_requests` with three nested embeds whose only surviving output was
-- a single integer. Every one of those is a separate HTTPS round trip to a
-- database on the other side of the world: about half a second of network each,
-- against queries that run in under three milliseconds over a few hundred rows.
-- The page was spending seconds of latency to compute twenty numbers.
--
-- So the arithmetic moves here and comes back as one object. Nothing about the
-- data made the page slow; only the asking did.
--
-- `security definer` because these counters span every customer's orders,
-- payments, threads and reviews, which no single caller's RLS policies let them
-- read. The guard is therefore the first statement in the body, the same shape
-- `admin_list_recharge_requests` uses: an active administrator or nothing.

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
    'games', (select count(*) from public.games),
    'active_games', (select count(*) from public.games where is_active),
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

-- Paid orders per day, oldest first, with empty days filled in so the caller
-- paints a timeline rather than a list. Bucketed in UTC like every other date
-- the store reasons about. Separate from the snapshot above because the day
-- count is the caller's to choose.
create or replace function public.admin_daily_sales_series(p_days integer default 14)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 14), 1), 366);
  v_today date := (now() at time zone 'utc')::date;
  v_first date;
  v_series jsonb;
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Administrator access required' using errcode = 'P0001';
  end if;

  v_first := v_today - (v_days - 1);

  with days as (
    select generate_series(v_first, v_today, interval '1 day')::date as day
  ),
  paid as (
    select
      (o.created_at at time zone 'utc')::date as day,
      count(*) as orders,
      coalesce(sum(o.total), 0) as revenue
    from public.orders o
    where o.payment_status = 'paid'
      and o.created_at >= (v_first::timestamp at time zone 'utc')
    group by 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', to_char(d.day, 'YYYY-MM-DD'),
        'orders', coalesce(p.orders, 0),
        'revenue', coalesce(p.revenue, 0)
      )
      order by d.day
    ),
    '[]'::jsonb
  )
  into v_series
  from days d
  left join paid p on p.day = d.day;

  return v_series;
end;
$$;

revoke all on function public.admin_overview_snapshot(integer) from public;
revoke all on function public.admin_daily_sales_series(integer) from public;
grant execute on function public.admin_overview_snapshot(integer) to authenticated;
grant execute on function public.admin_daily_sales_series(integer) to authenticated;

comment on function public.admin_overview_snapshot(integer) is 'Admin dashboard catalog counters, attention counters, sales KPIs and earnings in one call.';
comment on function public.admin_daily_sales_series(integer) is 'Admin dashboard paid-order totals per UTC day, oldest first, zero-filled.';
