create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories (id) on delete set null,
  slug text not null unique,
  name_ar text not null,
  name_en text not null,
  description_ar text,
  description_en text,
  image_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories (id) on delete set null,
  slug text not null unique,
  name_ar text not null,
  name_en text not null,
  points_name_ar text,
  points_name_en text,
  description_ar text,
  description_en text,
  image_url text,
  logo_url text,
  carousel_badge_ar text,
  carousel_badge_en text,
  carousel_focus_x numeric(5, 2) not null default 50,
  carousel_focus_y numeric(5, 2) not null default 50,
  is_active boolean not null default true,
  is_featured boolean not null default false,
  show_in_carousel boolean not null default false,
  carousel_order integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint games_carousel_focus_x_check check (carousel_focus_x between 0 and 100),
  constraint games_carousel_focus_y_check check (carousel_focus_y between 0 and 100)
);

create table if not exists public.game_regions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  code text not null,
  name_ar text not null,
  name_en text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (game_id, code)
);

create table if not exists public.game_input_fields (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  field_key text not null,
  field_type text not null default 'text'
    check (field_type in ('text', 'number', 'email', 'uid', 'server', 'charname', 'select')),
  label_ar text not null,
  label_en text not null,
  placeholder_ar text,
  placeholder_en text,
  options jsonb not null default '[]'::jsonb,
  is_required boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (game_id, field_key)
);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  slug text not null,
  offer_type text not null default 'topup'
    check (offer_type in ('topup', 'gift_card', 'redeem_code')),
  name_ar text not null,
  name_en text not null,
  description_ar text,
  description_en text,
  region_code text,
  price numeric(12, 2) not null check (price >= 0),
  original_price numeric(12, 2) check (original_price is null or original_price >= 0),
  currency text not null default 'USD',
  sale_image_url text,
  is_sale boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (game_id, slug)
);

create table if not exists public.provider_game_mappings (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  provider_name text not null,
  external_game_code text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (provider_name, external_game_code),
  unique (game_id, provider_name)
);

create table if not exists public.provider_offer_mappings (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers (id) on delete cascade,
  provider_name text not null,
  external_product_id text,
  external_catalogue_name text,
  supplier_cost_usd numeric(12, 4) check (supplier_cost_usd is null or supplier_cost_usd >= 0),
  pricing_mode text not null default 'default'
    check (pricing_mode in ('default', 'custom', 'fixed')),
  markup_percent numeric(7, 3) check (markup_percent is null or markup_percent >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (offer_id, provider_name),
  unique (provider_name, external_product_id, external_catalogue_name)
);

create index if not exists categories_active_sort_idx
  on public.categories (is_active, sort_order, name_en);
create index if not exists games_category_active_sort_idx
  on public.games (category_id, is_active, sort_order, name_en);
create index if not exists games_featured_idx
  on public.games (is_featured, show_in_carousel, carousel_order)
  where is_active = true;
create index if not exists game_regions_game_active_idx
  on public.game_regions (game_id, is_active, sort_order);
create index if not exists game_input_fields_game_sort_idx
  on public.game_input_fields (game_id, sort_order);
create index if not exists offers_game_active_sort_idx
  on public.offers (game_id, is_active, sort_order, name_en);
create index if not exists offers_sale_idx
  on public.offers (is_sale, is_active)
  where is_active = true;

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
before update on public.categories
for each row
execute function public.set_updated_at();

drop trigger if exists games_set_updated_at on public.games;
create trigger games_set_updated_at
before update on public.games
for each row
execute function public.set_updated_at();

drop trigger if exists game_regions_set_updated_at on public.game_regions;
create trigger game_regions_set_updated_at
before update on public.game_regions
for each row
execute function public.set_updated_at();

drop trigger if exists game_input_fields_set_updated_at on public.game_input_fields;
create trigger game_input_fields_set_updated_at
before update on public.game_input_fields
for each row
execute function public.set_updated_at();

drop trigger if exists offers_set_updated_at on public.offers;
create trigger offers_set_updated_at
before update on public.offers
for each row
execute function public.set_updated_at();

drop trigger if exists provider_game_mappings_set_updated_at on public.provider_game_mappings;
create trigger provider_game_mappings_set_updated_at
before update on public.provider_game_mappings
for each row
execute function public.set_updated_at();

drop trigger if exists provider_offer_mappings_set_updated_at on public.provider_offer_mappings;
create trigger provider_offer_mappings_set_updated_at
before update on public.provider_offer_mappings
for each row
execute function public.set_updated_at();

alter table public.categories enable row level security;
alter table public.games enable row level security;
alter table public.game_regions enable row level security;
alter table public.game_input_fields enable row level security;
alter table public.offers enable row level security;
alter table public.provider_game_mappings enable row level security;
alter table public.provider_offer_mappings enable row level security;

drop policy if exists categories_select_public_active on public.categories;
create policy categories_select_public_active
on public.categories
for select
to anon, authenticated
using (is_active = true);

drop policy if exists categories_admin_all on public.categories;
create policy categories_admin_all
on public.categories
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists games_select_public_active on public.games;
create policy games_select_public_active
on public.games
for select
to anon, authenticated
using (is_active = true);

drop policy if exists games_admin_all on public.games;
create policy games_admin_all
on public.games
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists game_regions_select_public_active on public.game_regions;
create policy game_regions_select_public_active
on public.game_regions
for select
to anon, authenticated
using (
  is_active = true
  and exists (
    select 1 from public.games
    where games.id = game_regions.game_id
      and games.is_active = true
  )
);

drop policy if exists game_regions_admin_all on public.game_regions;
create policy game_regions_admin_all
on public.game_regions
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists game_input_fields_select_public_active on public.game_input_fields;
create policy game_input_fields_select_public_active
on public.game_input_fields
for select
to anon, authenticated
using (
  exists (
    select 1 from public.games
    where games.id = game_input_fields.game_id
      and games.is_active = true
  )
);

drop policy if exists game_input_fields_admin_all on public.game_input_fields;
create policy game_input_fields_admin_all
on public.game_input_fields
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists offers_select_public_active on public.offers;
create policy offers_select_public_active
on public.offers
for select
to anon, authenticated
using (
  is_active = true
  and exists (
    select 1 from public.games
    where games.id = offers.game_id
      and games.is_active = true
  )
);

drop policy if exists offers_admin_all on public.offers;
create policy offers_admin_all
on public.offers
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists provider_game_mappings_admin_all on public.provider_game_mappings;
create policy provider_game_mappings_admin_all
on public.provider_game_mappings
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists provider_offer_mappings_admin_all on public.provider_offer_mappings;
create policy provider_offer_mappings_admin_all
on public.provider_offer_mappings
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

grant select on public.categories, public.games, public.game_regions,
  public.game_input_fields, public.offers to anon, authenticated;
grant select, insert, update, delete on public.categories, public.games,
  public.game_regions, public.game_input_fields, public.offers,
  public.provider_game_mappings, public.provider_offer_mappings to authenticated;
