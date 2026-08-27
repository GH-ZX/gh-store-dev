-- Allow the new admin alerts introduced with the full control centre.
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
    'new_customer'
  ));
