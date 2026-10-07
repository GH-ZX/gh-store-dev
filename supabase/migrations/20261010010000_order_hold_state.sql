-- Order hold state.
--
-- `held` means: the customer paid, the goods are not out, and the store is
-- waiting on a supplier wallet the owner controls. It is not a failure and not
-- a refund — the money was already taken at checkout and stays taken; the order
-- simply cannot be bought from the supplier until the owner recharges that
-- supplier account and presses "I recharged — deliver now" in the dashboard.
--
-- Why a status rather than the old behaviour: a supplier that answered
-- "Insufficient balance to complete this order." used to leave the order at
-- `processing`, which nothing ever picked up again (the reconciliation sweep
-- does not re-buy for an existing attempt). Three live orders died that way —
-- paid, invisible in any queue, and never delivered. `held` is visible: it is
-- excluded from the sweep and from auto-refund, and it is what the dashboard's
-- held queue and the per-order "deliver now" button key off.
--
-- Two companion columns so the held queue can be sorted and explained without
-- opening each order:
--   * `held_at`     — when the hold started, for hold age.
--   * `held_reason` — the supplier's answer / what the owner must do, refreshed
--                     on every failed retry so the queue never shows a stale
--                     reason.
--
-- Idempotent and safe to re-run: the constraint is dropped by name (with the
-- two names it could have been auto-generated under) and re-added, and the
-- columns use `if not exists`. Re-running changes nothing.
--
-- Scope: no data migration. Three historical orders sit in `processing` with an
-- `insufficient_balance` attempt; their status is deliberately NOT rewritten
-- here. The dashboard and customer read paths treat that state as held-like, so
-- they surface in the held queue with the same button without a blind UPDATE
-- that would hide what the supplier actually recorded.

-- ---------------------------------------------------------------------------
-- 1. Allow 'held' alongside every existing status.
-- ---------------------------------------------------------------------------

alter table public.orders
  drop constraint if exists orders_status_check;

-- The name Postgres gives an inline `check (status in (...))` on this table.
alter table public.orders
  drop constraint if exists orders_status_check1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'orders'
      and c.conname = 'orders_status_check'
  ) then
    alter table public.orders
      add constraint orders_status_check check (
        status in (
          'pending',
          'payment_pending',
          'paid',
          'processing',
          'fulfilling',
          'held',
          'completed',
          'failed',
          'refunded',
          'cancelled'
        )
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Hold metadata.
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists held_reason text;

alter table public.orders
  add column if not exists held_at timestamptz;

comment on column public.orders.held_reason is
  'Why this order is held: the supplier''s answer, refreshed on each failed retry. Null when the order is not held.';
comment on column public.orders.held_at is
  'When the order entered the held state, for hold age in the dashboard queue. Null when the order is not held.';

-- The dashboard sorts the held queue oldest first and counts it; the existing
-- orders_status_created_idx already leads with `status`, so no new index is
-- needed for the queue itself. This one serves the age ordering within a status.
create index if not exists orders_held_at_idx
  on public.orders (held_at)
  where held_at is not null;

-- ---------------------------------------------------------------------------
-- Verification (run after applying; all four must hold):
--
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.orders'::regclass and conname = 'orders_status_check';
--   -- expects a definition containing 'held' and all nine pre-existing values.
--
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'orders'
--      and column_name in ('held_reason', 'held_at');
--   -- expects 2 rows, both nullable (text / timestamp with time zone).
--
--   select count(*) from public.orders where status = 'held';
--   -- expects 0 immediately after this migration: nothing is migrated into it.
--
--   select status, count(*) from public.orders group by status order by status;
--   -- unchanged from before the migration.
-- ---------------------------------------------------------------------------
