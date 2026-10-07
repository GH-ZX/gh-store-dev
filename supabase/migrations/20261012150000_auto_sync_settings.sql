-- 20261012150000_auto_sync_settings.sql
-- Settings for automated supplier stock & price sync.

alter table public.store_settings
  add column if not exists auto_sync_enabled boolean default false,
  add column if not exists auto_sync_max_change_pct numeric(5, 2) default 15
  check (auto_sync_max_change_pct >= 0 and auto_sync_max_change_pct <= 100);

comment on column public.store_settings.auto_sync_enabled is
  'When true, scheduled provider sync automatically updates active stock and prices within safety threshold.';
comment on column public.store_settings.auto_sync_max_change_pct is
  'Maximum price change percent allowable for automatic sync without requiring manual review.';
