-- Aggregate counts only: no identities, IP addresses, search text or session identifiers.
create table public.store_daily_metrics (
  day date not null default (now() at time zone 'utc')::date,
  event text not null check (event in ('catalog_view','product_view','checkout_view','search','search_empty','recharge_view')),
  count bigint not null default 0 check (count >= 0),
  primary key(day,event)
);
alter table public.store_daily_metrics enable row level security;
create policy store_metrics_admin_read on public.store_daily_metrics for select to authenticated using ((select public.is_admin((select auth.uid()))));
grant select on public.store_daily_metrics to authenticated;
revoke all on public.store_daily_metrics from anon;
create function public.count_store_event(p_event text) returns void
language sql security definer set search_path = '' as $$
  insert into public.store_daily_metrics(day,event,count) values ((now() at time zone 'utc')::date,p_event,1)
  on conflict(day,event) do update set count=store_daily_metrics.count+1;
$$;
revoke all on function public.count_store_event(text) from public,anon,authenticated;
grant execute on function public.count_store_event(text) to service_role;
