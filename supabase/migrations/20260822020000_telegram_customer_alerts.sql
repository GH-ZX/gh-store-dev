-- Customer-directed Telegram alerts.
--
-- `telegram_alerts` was owner-only: every row went to the owner chat. Now an
-- alert can carry an optional `user_id`; when set, the Worker delivers it to
-- that customer's linked chat instead of the owner's. The alert *types* are
-- shared (order_failed already carries refund info), so nothing changes about
-- the owner side — the audience is decided by whether `user_id` is present.

alter table public.telegram_alerts
  add column if not exists user_id uuid references public.profiles (id) on delete cascade;

-- New type for customer-facing delivery confirmation. Owner types are unchanged.
alter table public.telegram_alerts
  drop constraint if exists telegram_alerts_type_check;

alter table public.telegram_alerts
  add constraint telegram_alerts_type_check check (type in (
    'order_placed',
    'order_failed',
    'recharge_request',
    'support_message',
    'low_wallet',
    'order_delivered'
  ));

create index if not exists telegram_alerts_user_pending_idx
  on public.telegram_alerts (user_id, created_at)
  where status = 'pending' or status = 'failed';

-- The chat link now remembers the customer's language so the Worker can render
-- customer-directed alerts in the language the customer linked with.
alter table public.telegram_chat_links
  add column if not exists language_code text;
