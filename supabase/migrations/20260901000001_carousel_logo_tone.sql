-- Per-product duotone recolor of the carousel logo.
-- Admins pick "light" (white) or "dark" (black) so a logo reads on the hero
-- tile regardless of the artwork behind it; null keeps the original.
alter table public.products
  add column if not exists carousel_logo_tone text;
