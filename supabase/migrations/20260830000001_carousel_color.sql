-- Add a per-game accent color for the carousel thumbnail strip.
-- Admins pick a hex colour per game; the thumbnail's bottom line uses it.
alter table public.games
  add column if not exists carousel_color text;
