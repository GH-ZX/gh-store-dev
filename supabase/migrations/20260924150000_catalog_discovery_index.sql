-- The normalized search field replaces separate name/description predicates.
-- Keep substring search indexed as more supplier catalogs are imported.
create index if not exists products_discovery_trgm_idx
  on public.products using gin (search_text extensions.gin_trgm_ops)
  where is_active = true;
