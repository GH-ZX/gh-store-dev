-- Supplier links for products, and a living product-mapping mirror.
--
-- Every imported product keeps the address of its supplier listing so an
-- operator can jump from our catalog to the provider's own page. The column
-- lives on `provider_game_mappings` (what imports write today) and mirrors
-- into `provider_product_mappings`, because a product may outlive its game
-- extension and must not lose its sources.
--
-- A trigger keeps the product-side mappings in step from now on, which turns
-- `provider_product_mappings` from a one-time backfill into real state: any
-- import that touches the game table updates the product core automatically.

alter table public.provider_game_mappings
  add column if not exists external_url text;

alter table public.provider_product_mappings
  add column if not exists external_url text;

-- Lift a link an importer once stored inside metadata onto the real column,
-- accepting the key names in likely use. First non-empty wins.
update public.provider_game_mappings m
set external_url = candidate.url
from (
  select id,
    coalesce(
      nullif(metadata ->> 'external_url', ''),
      nullif(metadata ->> 'source_url', ''),
      nullif(metadata ->> 'listing_url', ''),
      nullif(metadata ->> 'url', '')
    ) as url
  from public.provider_game_mappings
  where external_url is null
) as candidate
where candidate.id = m.id
  and candidate.url is not null;

-- Existing product mappings receive whatever the game side already has.
update public.provider_product_mappings p
set external_url = g.external_url
from public.provider_game_mappings g
where g.game_id = p.product_id
  and g.provider_name = p.provider_name
  and g.external_url is not null
  and (p.external_url is distinct from g.external_url);

create or replace function public.sync_game_mapping_to_product()
returns trigger
language plpgsql
as $$
begin
  insert into public.provider_product_mappings (
    product_id, provider_name, external_product_code, metadata, external_url
  )
  values (
    new.game_id, new.provider_name, new.external_game_code, new.metadata, new.external_url
  )
  on conflict (provider_name, external_product_code) do update set
    product_id = excluded.product_id,
    metadata = excluded.metadata,
    external_url = excluded.external_url,
    updated_at = timezone('utc', now());

  return new;
end;
$$;

drop trigger if exists game_mappings_sync_product on public.provider_game_mappings;
create trigger game_mappings_sync_product
after insert or update of game_id, provider_name, external_game_code, metadata, external_url
on public.provider_game_mappings
for each row
execute function public.sync_game_mapping_to_product();

create or replace function public.prune_game_mapping_from_product()
returns trigger
language plpgsql
as $$
begin
  delete from public.provider_product_mappings
  where provider_name = old.provider_name
    and external_product_code = old.external_game_code;

  return old;
end;
$$;

drop trigger if exists game_mappings_prune_product on public.provider_game_mappings;
create trigger game_mappings_prune_product
after delete on public.provider_game_mappings
for each row
execute function public.prune_game_mapping_from_product();
