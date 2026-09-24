-- Public merchandising controls and a separate, private analytics integration.
create table public.store_discovery_settings (
  id boolean primary key default true check (id),
  quick_buy_count integer not null default 6 check (quick_buy_count between 0 and 12),
  category_count integer not null default 8 check (category_count between 0 and 24),
  products_per_category integer not null default 6 check (products_per_category between 2 and 12),
  offers_per_product integer not null default 12 check (offers_per_product between 2 and 24),
  hide_empty_categories boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.store_discovery_settings(id) values(true);
alter table public.store_discovery_settings enable row level security;
grant select on public.store_discovery_settings to anon, authenticated;
grant update on public.store_discovery_settings to authenticated;
create policy discovery_read on public.store_discovery_settings for select using (true);
create policy discovery_admin_update on public.store_discovery_settings for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create table public.store_posthog_settings (
  id boolean primary key default true check(id),
  enabled boolean not null default false,
  project_key text not null default '' check(length(project_key) <= 200),
  region text not null default 'EU' check(region in ('US','EU')),
  project_id text not null default '' check(project_id ~ '^[0-9]{0,16}$'),
  updated_at timestamptz not null default now(),
  check (not enabled or project_key ~ '^phc_[A-Za-z0-9_-]+$')
);
insert into public.store_posthog_settings(id) values(true);
alter table public.store_posthog_settings enable row level security;
revoke all on public.store_posthog_settings from anon;
grant select, update on public.store_posthog_settings to authenticated;
grant all on public.store_posthog_settings to service_role;
create policy posthog_admin_read on public.store_posthog_settings for select to authenticated using(public.is_admin(auth.uid()));
create policy posthog_admin_update on public.store_posthog_settings for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
-- Only the consent UI's enabled flag is public. Never expose integration settings.
create function public.store_posthog_enabled() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select enabled from public.store_posthog_settings where id),false)
$$;
revoke all on function public.store_posthog_enabled() from public;
grant execute on function public.store_posthog_enabled() to anon, authenticated;

-- Never silently treat a non-USD request as dollar-denominated USDT credit.
create or replace function public.snapshot_recharge_destination() returns trigger
language plpgsql security definer set search_path = '' as $$
declare method jsonb;
begin
  new.payment_network := null; new.payment_destination := null; new.payment_tx_hash := null; new.payment_verification := null;
  select m into method from public.store_settings s, jsonb_array_elements(coalesce(s.payments->'manual_methods','[]'::jsonb)) m where s.id = 'global' and m->>'id' = new.payment_method and m->>'enabled' = 'true' limit 1;
  if upper(new.payment_method) = 'BEP20' then
    if new.requested_currency is distinct from 'USD' then raise exception 'BEP20 recharge requires USD wallet currency'; end if;
    if method is null or coalesce(method->>'account','') !~ '^0x[0-9a-fA-F]{40}$' then raise exception 'Payment method unavailable'; end if;
    new.payment_network := 'BEP20'; new.payment_destination := method->>'account';
  end if;
  return new;
end $$;
