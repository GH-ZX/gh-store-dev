-- BatStore stock sync: throttle state, a sync-log kind, and the index the
-- sweep needs.
--
-- Why this exists: BatStore is a Telegram-bot reseller with dynamic stock. The
-- store decides visibility from `offers.is_active`, and the import service can
-- park a zero-stock offer (`is_active = false` + `metadata.parked_by_stock_sync
-- = true`). Nothing ran that logic on a schedule, so an offer that was in stock
-- when it was imported stayed active through the supplier running dry, and the
-- customer was charged for a product BatStore could not deliver (live evidence:
-- fulfillment_attempts for BatStore product #16, "Insufficient stock ... available
-- 0"). The Worker's 5-minute tick now runs a throttled stock sweep instead.
--
-- Three parts, all idempotent:
--   1. `provider_sync_state` — one throttle row per (provider, kind), so a
--      5-minute tick can refresh BatStore at most once every N minutes and can
--      be inspected by an operator.
--   2. `provider_sync_logs.kind` gains `stock_sync` (the existing check
--      constraint allows only catalog_import/catalog_sync/wallet_check/
--      reconciliation).
--   3. An index on `provider_offer_mappings (provider_name, offer_id)` so the
--      sweep can read the 57 BatStore mappings without a sequential scan, and
--      so the checkout preflight can find one offer's mapping in one lookup.

-- 1. Throttle state -----------------------------------------------------------

create table if not exists public.provider_sync_state (
  id uuid primary key default gen_random_uuid(),

  -- Stable identity of one throttled sweep: 'batstore' + 'stock_sync'.
  provider_name text not null,
  kind text not null,

  -- When the sweep last actually ran (not last attempted). The throttle reads
  -- this and skips while `now - last_run_at < interval`.
  last_run_at timestamptz,

  -- Free-form per-run reporting: counts, whether it was throttled, and the
  -- reason it did nothing. Shown to an operator; never read by the sweep.
  details jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  unique (provider_name, kind)
);

create index if not exists provider_sync_state_kind_idx
  on public.provider_sync_state (kind, last_run_at desc nulls last);

drop trigger if exists provider_sync_state_set_updated_at on public.provider_sync_state;
create trigger provider_sync_state_set_updated_at
before update on public.provider_sync_state
for each row
execute function public.set_updated_at();

alter table public.provider_sync_state enable row level security;

-- Admin-only, exactly like provider_sync_logs: the details name supplier
-- product ids and stock counts.
drop policy if exists provider_sync_state_admin_all on public.provider_sync_state;
create policy provider_sync_state_admin_all
on public.provider_sync_state
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

grant select, insert, update, delete on public.provider_sync_state to authenticated;

-- 2. A sync-log kind for stock sweeps ----------------------------------------
-- `drop ... if exists` then re-add covers both the original inline check
-- constraint and any prior run of this migration.

alter table public.provider_sync_logs
  drop constraint if exists provider_sync_logs_kind_check;

alter table public.provider_sync_logs
  add constraint provider_sync_logs_kind_check
  check (kind in ('catalog_import', 'catalog_sync', 'wallet_check', 'reconciliation', 'stock_sync'));

-- 3. The index the sweep and the preflight need -------------------------------

create index if not exists provider_offer_mappings_provider_offer_idx
  on public.provider_offer_mappings (provider_name, offer_id);
