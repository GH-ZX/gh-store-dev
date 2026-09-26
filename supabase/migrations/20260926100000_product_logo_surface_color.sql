-- Per-product carousel logo tile colour.
--
-- The tile behind a carousel logo was a fixed brand surface, so an admin could
-- recolour the mark but not the container it sits in. This adds that choice.
--
-- Only a plain hex value is accepted. An empty value keeps the shared brand
-- surface, so every product without an override still looks identical.
alter table public.products add column if not exists logo_surface_color text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_logo_surface_color_hex'
  ) then
    alter table public.products add constraint products_logo_surface_color_hex
      check (logo_surface_color is null or logo_surface_color ~ '^#([0-9a-f]{3}|[0-9a-f]{6})$');
  end if;
end;
$$;

comment on column public.products.logo_surface_color is 'Optional hex override for the carousel logo tile. Null keeps the shared brand surface.';
