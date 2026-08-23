-- Provider-neutral catalog core.
--
-- `products` is the parent entity for everything GH Store can sell. Existing
-- `games` rows keep their ids and URLs as a compatibility extension while new
-- providers may create products that have no game-specific row at all.
--
-- This migration is additive and idempotent: current storefront routes,
-- checkout RPCs, fulfilment code, and provider imports continue using `games`
-- while the product core is introduced safely underneath them.

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories (id) on delete set null,
  slug text not null unique,
  name_ar text not null,
  name_en text not null,
  description_ar text,
  description_en text,
  image_url text,
  logo_url text,
  product_kind text not null default 'other'
    check (product_kind in ('game', 'digital', 'subscription', 'service', 'virtual_currency', 'other')),
  is_active boolean not null default true,
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Keep the taxonomy provider-neutral. Games is one category, not the catalog
-- parent; its children can distinguish voucher products from direct recharge.
insert into public.categories (parent_id, slug, name_ar, name_en, sort_order, is_active)
select c.id, child.slug, child.name_ar, child.name_en, child.sort_order, true
from public.categories c
cross join (values
  ('games-vouchers', 'أكواد الألعاب', 'Game vouchers', 10),
  ('games-instant-recharge', 'شحن الألعاب الفوري', 'Instant game recharge', 20)
) as child(slug, name_ar, name_en, sort_order)
where c.slug = 'games'
on conflict (slug) do nothing;

-- Preserve every current public id and URL. A game is a product with a game
-- extension, not a separate kind of sellable parent.
insert into public.products (
  id, category_id, slug, name_ar, name_en, description_ar, description_en,
  image_url, logo_url, product_kind, is_active, is_featured, sort_order,
  created_at, updated_at
)
select
  g.id, g.category_id, g.slug, g.name_ar, g.name_en, g.description_ar, g.description_en,
  g.image_url, g.logo_url, 'game', g.is_active, g.is_featured, g.sort_order,
  g.created_at, g.updated_at
from public.games g
on conflict (id) do update set
  category_id = excluded.category_id,
  slug = excluded.slug,
  name_ar = excluded.name_ar,
  name_en = excluded.name_en,
  description_ar = excluded.description_ar,
  description_en = excluded.description_en,
  image_url = excluded.image_url,
  logo_url = excluded.logo_url,
  product_kind = 'game',
  is_active = excluded.is_active,
  is_featured = excluded.is_featured,
  sort_order = excluded.sort_order,
  updated_at = excluded.updated_at;

alter table public.offers
  add column if not exists product_id uuid;

update public.offers
set product_id = game_id
where product_id is null;

-- Existing rows with one clear offer type move beneath the appropriate Games
-- child. Mixed products stay under Games until an operator chooses a split.
update public.products p
set category_id = child.id,
    updated_at = timezone('utc', now())
from public.categories child
where child.slug = 'games-instant-recharge'
  and p.category_id = (select id from public.categories where slug = 'games')
  and exists (
    select 1 from public.offers o
    where o.product_id = p.id and o.offer_type = 'topup'
  )
  and not exists (
    select 1 from public.offers o
    where o.product_id = p.id and o.offer_type in ('gift_card', 'redeem_code')
  );

update public.products p
set category_id = child.id,
    updated_at = timezone('utc', now())
from public.categories child
where child.slug = 'games-vouchers'
  and p.category_id = (select id from public.categories where slug = 'games')
  and exists (
    select 1 from public.offers o
    where o.product_id = p.id and o.offer_type in ('gift_card', 'redeem_code')
  )
  and not exists (
    select 1 from public.offers o
    where o.product_id = p.id and o.offer_type = 'topup'
  );

-- Keep legacy category consumers aligned while they are still on `games`.
update public.games g
set category_id = p.category_id,
    updated_at = timezone('utc', now())
from public.products p
where p.id = g.id
  and p.category_id is not null
  and p.category_id <> g.category_id;

alter table public.offers
  alter column game_id drop not null;

alter table public.offers
  drop constraint if exists offers_product_id_fkey;

alter table public.offers
  add constraint offers_product_id_fkey
  foreign key (product_id) references public.products (id) on delete cascade;

alter table public.offers
  drop constraint if exists offers_product_id_required;

alter table public.offers
  add constraint offers_product_id_required
  check (product_id is not null);

create unique index if not exists offers_product_slug_key
  on public.offers (product_id, slug);

create or replace function public.sync_offer_product_reference()
returns trigger
language plpgsql
as $$
begin
  -- Legacy writers provide game_id; generic writers provide product_id.
  if new.product_id is null and new.game_id is not null then
    new.product_id := new.game_id;
  end if;

  if new.product_id is null then
    raise exception 'An offer must belong to a product';
  end if;

  return new;
end;
$$;

drop trigger if exists offers_sync_product_reference on public.offers;
create trigger offers_sync_product_reference
before insert or update of game_id, product_id on public.offers
for each row
execute function public.sync_offer_product_reference();

create table if not exists public.provider_product_mappings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  provider_name text not null,
  external_product_code text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (provider_name, external_product_code),
  unique (product_id, provider_name)
);

insert into public.provider_product_mappings (
  product_id, provider_name, external_product_code, metadata, created_at, updated_at
)
select
  m.game_id, m.provider_name, m.external_game_code, m.metadata, m.created_at, m.updated_at
from public.provider_game_mappings m
join public.products p on p.id = m.game_id
on conflict (provider_name, external_product_code) do update set
  product_id = excluded.product_id,
  metadata = excluded.metadata,
  updated_at = excluded.updated_at;

create index if not exists products_category_active_sort_idx
  on public.products (category_id, is_active, sort_order, name_en);
create index if not exists products_kind_active_sort_idx
  on public.products (product_kind, is_active, sort_order, name_en);
create index if not exists provider_product_mappings_product_idx
  on public.provider_product_mappings (product_id, provider_name);
create index if not exists offers_product_active_sort_idx
  on public.offers (product_id, is_active, sort_order, name_en);

create or replace function public.sync_game_to_product()
returns trigger
language plpgsql
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  insert into public.products (
    id, category_id, slug, name_ar, name_en, description_ar, description_en,
    image_url, logo_url, product_kind, is_active, is_featured, sort_order,
    created_at, updated_at
  )
  values (
    new.id, new.category_id, new.slug, new.name_ar, new.name_en,
    new.description_ar, new.description_en, new.image_url, new.logo_url,
    'game', new.is_active, new.is_featured, new.sort_order,
    new.created_at, new.updated_at
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    slug = excluded.slug,
    name_ar = excluded.name_ar,
    name_en = excluded.name_en,
    description_ar = excluded.description_ar,
    description_en = excluded.description_en,
    image_url = excluded.image_url,
    logo_url = excluded.logo_url,
    product_kind = 'game',
    is_active = excluded.is_active,
    is_featured = excluded.is_featured,
    sort_order = excluded.sort_order,
    updated_at = excluded.updated_at;

  return new;
end;
$$;

drop trigger if exists games_sync_product on public.games;
create trigger games_sync_product
after insert or update of category_id, slug, name_ar, name_en, description_ar,
  description_en, image_url, logo_url, is_active, is_featured, sort_order on public.games
for each row
execute function public.sync_game_to_product();

create or replace function public.sync_product_to_game()
returns trigger
language plpgsql
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  update public.games
  set category_id = new.category_id,
      slug = new.slug,
      name_ar = new.name_ar,
      name_en = new.name_en,
      description_ar = new.description_ar,
      description_en = new.description_en,
      image_url = new.image_url,
      logo_url = new.logo_url,
      is_active = new.is_active,
      is_featured = new.is_featured,
      sort_order = new.sort_order,
      updated_at = new.updated_at
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists products_sync_game on public.products;
create trigger products_sync_game
after update of category_id, slug, name_ar, name_en, description_ar,
  description_en, image_url, logo_url, is_active, is_featured, sort_order on public.products
for each row
execute function public.sync_product_to_game();

-- New products can exist without a game extension. Public offers therefore
-- authorize through products, while the legacy game policy is replaced below.
drop policy if exists offers_select_public_active on public.offers;
create policy offers_select_public_active
on public.offers
for select
to anon, authenticated
using (
  is_active = true
  and exists (
    select 1 from public.products
    where products.id = offers.product_id
      and products.is_active = true
  )
);

alter table public.products enable row level security;
alter table public.provider_product_mappings enable row level security;

drop policy if exists products_select_public_active on public.products;
create policy products_select_public_active
on public.products
for select
to anon, authenticated
using (is_active = true);

drop policy if exists products_admin_all on public.products;
create policy products_admin_all
on public.products
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists provider_product_mappings_admin_all on public.provider_product_mappings;
create policy provider_product_mappings_admin_all
on public.provider_product_mappings
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row
execute function public.set_updated_at();

drop trigger if exists provider_product_mappings_set_updated_at on public.provider_product_mappings;
create trigger provider_product_mappings_set_updated_at
before update on public.provider_product_mappings
for each row
execute function public.set_updated_at();

grant select on public.products to anon, authenticated;
grant select, insert, update, delete on public.products, public.provider_product_mappings to authenticated;
