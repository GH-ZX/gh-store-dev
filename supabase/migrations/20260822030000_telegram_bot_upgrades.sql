-- Telegram bot upgrade batch.
--
-- 1. Two more customer-facing alert types: recharge outcomes and support
--    replies, mirroring the in-app notifications those events already produce.
-- 2. `telegram_chat_prefs`: per-chat preferences (language override) that work
--    even before a customer links their account. One row per chat.

alter table public.telegram_alerts
  drop constraint if exists telegram_alerts_type_check;

alter table public.telegram_alerts
  add constraint telegram_alerts_type_check check (type in (
    'order_placed',
    'order_failed',
    'recharge_request',
    'support_message',
    'low_wallet',
    'order_delivered',
    'recharge_approved',
    'recharge_rejected',
    'support_reply'
  ));

create table if not exists public.telegram_chat_prefs (
  chat_id bigint primary key,
  locale text check (locale in ('ar', 'en')),
  -- Lightweight conversation state: 'support' means the next message from this
  -- chat is a support request body. Kept here so the bot can run multi-step
  -- flows without any in-memory state.
  pending text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists telegram_chat_prefs_set_updated_at on public.telegram_chat_prefs;
create trigger telegram_chat_prefs_set_updated_at
before update on public.telegram_chat_prefs
for each row
execute function public.set_updated_at();

alter table public.telegram_chat_prefs enable row level security;

-- The bot writes and reads these with the service key; customers have no reason
-- to touch them directly.
revoke all on public.telegram_chat_prefs from anon, authenticated;
grant select, insert, update on public.telegram_chat_prefs to service_role;
