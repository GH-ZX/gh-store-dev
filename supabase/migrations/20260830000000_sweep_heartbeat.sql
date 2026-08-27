-- The reconciliation sweep's heartbeat.
--
-- The sweep runs on the Worker's cron (every five minutes) calling
-- POST /api/reconcile. When it stops — a misconfigured secret, a broken
-- deploy, a rotated key — nothing fails loudly: orders simply stay
-- `fulfilling` until a customer complains, which is the most expensive way to
-- learn about it. This table is the state the heartbeat check needs: the app
-- stamps it after every successful sweep, and the Worker's scheduled tick
-- compares the stamp against the clock and alerts the owner when the sweep has
-- gone quiet.
--
-- One row, by construction: `id` is pinned to 'global', so an upsert can never
-- accumulate history. The Worker holds the service-role key and reads it
-- directly; row level security with no policies fails closed for every other
-- role, the same stance as `telegram_alerts` — this is plumbing between two
-- halves of the store's own infrastructure, not customer data.
--
-- `last_error` is the most recent failure's summary, kept short by the writer
-- (see `src/lib/services/sweep-heartbeat.service.ts`), so the Telegram alert
-- and the operator's query both can answer "since when, and why".

create table if not exists public.sweep_heartbeats (
  id text primary key default 'global' check (id = 'global'),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.sweep_heartbeats enable row level security;

-- RLS with no policies denies every non-superuser role regardless of grants;
-- only the service role, which bypasses RLS, reads and writes this table.
revoke all on public.sweep_heartbeats from anon, authenticated;

-- The sweep alert reaches the owner's chat through the existing Telegram
-- queue, whose `type` column is constrained to the known set. Extend it with
-- the one new type this feature writes (same shape as
-- 20260829110000_telegram_alert_types.sql).
alter table public.telegram_alerts
  drop constraint if exists telegram_alerts_type_check;

alter table public.telegram_alerts
  add constraint telegram_alerts_type_check
  check (type in (
    'order_placed',
    'order_failed',
    'order_delivered',
    'recharge_request',
    'recharge_approved',
    'recharge_rejected',
    'support_message',
    'support_reply',
    'low_wallet',
    'low_stock',
    'wallet_adjusted',
    'new_customer',
    'sweep_stalled'
  ));
