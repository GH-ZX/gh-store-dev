-- Owner Telegram alerts.
--
-- The store never talks to Telegram synchronously: an alert is a row here, and
-- the Cloudflare Worker's scheduled handler drains the queue and delivers it.
-- That keeps Telegram outages and rate limits off the money path entirely.
--
-- `store_settings.telegram` holds the bot configuration: `bot_token`,
-- `chat_id` (the owner's Telegram chat, learned from /start), `enabled`, and
-- per-type toggles.

alter table public.store_settings
  add column if not exists telegram jsonb not null default '{}'::jsonb;

alter table public.store_settings
  drop constraint if exists store_settings_telegram_is_object;

alter table public.store_settings
  add constraint store_settings_telegram_is_object check (jsonb_typeof(telegram) = 'object');

create table if not exists public.telegram_alerts (
  id bigint generated always as identity primary key,
  type text not null check (type in (
    'order_placed',
    'order_failed',
    'recharge_request',
    'support_message',
    'low_wallet'
  )),
  payload jsonb not null default '{}'::jsonb,
  dedup_key text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  created_at timestamptz not null default timezone('utc', now()),
  sent_at timestamptz,
  last_attempted_at timestamptz,
  unique (type, dedup_key)
);

create index if not exists telegram_alerts_pending_idx
  on public.telegram_alerts (created_at)
  where status = 'pending';

alter table public.telegram_alerts enable row level security;

-- The worker drains the queue with the service key and the application enqueues
-- with the service key; no user session reads or writes these rows.
revoke all on public.telegram_alerts from anon, authenticated;
grant select, insert, update, delete on public.telegram_alerts to service_role;
