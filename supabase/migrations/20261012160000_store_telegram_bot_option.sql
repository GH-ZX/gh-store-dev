-- Migration: Add the Telegram Store Bot purchase option to store_settings
--
-- The store owner operates a dedicated automated Telegram sales bot (https://t.me/gh_store1_bot)
-- that sells the same digital catalog products directly to buyers on Telegram.
--
-- Note on bot separation:
-- 1. store_settings.telegram: Reserved exclusively for the store administrator alerts
--    and system logs (order notifications, failure alerts, recharge verification). This
--    must NOT be confused with or replaced by the consumer storefront bot.
-- 2. social_links: Customer-facing links. Includes:
--    - WhatsApp direct contact (https://wa.me/963968098330)
--    - Owner personal Telegram for 1-on-1 support (https://t.me/ahmedghx)
--    - Dedicated Telegram store bot for buyers to purchase (https://t.me/gh_store1_bot)
-- 3. contact.channels: Customer contact options. Includes:
--    - WhatsApp, Personal Telegram, Store Bot, Email.
-- 4. telegram_store_bot_url: Dedicated column on store_settings holding the store bot URL.

-- 1. Add dedicated store bot column
alter table public.store_settings
  add column if not exists telegram_store_bot_url text default 'https://t.me/gh_store1_bot';

comment on column public.store_settings.telegram_store_bot_url is
  'Customer-facing Telegram bot URL for purchasing products directly on Telegram (separate from admin alerts).';

-- 2. Update store_settings with the store bot in social_links and contact channels
update public.store_settings
set
  telegram_store_bot_url = 'https://t.me/gh_store1_bot',
  social_links = '[
    {"platform":"whatsapp","label_ar":"واتساب","label_en":"WhatsApp","url":"https://wa.me/963968098330"},
    {"platform":"telegram","label_ar":"تيليجرام (الدعم الفني)","label_en":"Telegram (Support)","url":"https://t.me/ahmedghx"},
    {"platform":"telegram","label_ar":"بوت المتجر للشراء","label_en":"Store Bot (Shop on Telegram)","url":"https://t.me/gh_store1_bot"}
  ]'::jsonb,
  contact = jsonb_set(
    coalesce(contact, '{}'::jsonb),
    '{channels}',
    '[
      {"kind":"whatsapp","label_ar":"واتساب","label_en":"WhatsApp","value":"00963968098330"},
      {"kind":"telegram","label_ar":"تيليجرام (الدعم)","label_en":"Telegram (Support)","value":"ahmedghx"},
      {"kind":"telegram","label_ar":"بوت المتجر للشراء","label_en":"Store Bot (Shop)","value":"gh_store1_bot"},
      {"kind":"email","label_ar":"البريد الإلكتروني","label_en":"Email","value":"ahmedghuwu3@gmail.com"}
    ]'::jsonb,
    true
  ),
  updated_at = timezone('utc', now())
where id = 'global';

-- 3. Expose telegram_store_bot_url safely through public RPC
create or replace function public.get_public_store_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'home_layout', coalesce(settings.home_layout, '[]'::jsonb),
    'social_links', coalesce(settings.social_links, '[]'::jsonb),
    'seo', coalesce(settings.seo, '{}'::jsonb),
    'contact', coalesce(settings.contact, '{}'::jsonb),
    'theme', coalesce(settings.theme, '{}'::jsonb),
    'branding', coalesce(settings.branding, '{}'::jsonb),
    'maintenance_mode', settings.maintenance_mode,
    'maintenance_message_ar', settings.maintenance_message_ar,
    'maintenance_message_en', settings.maintenance_message_en,
    'telegram_bot_username', coalesce(
      nullif(settings.telegram->'telegram'->>'bot_username', ''),
      settings.telegram->>'bot_username',
      ''
    ),
    'telegram_store_bot_url', coalesce(settings.telegram_store_bot_url, 'https://t.me/gh_store1_bot')
  )
  from public.store_settings as settings
  where settings.id = 'global';
$$;

revoke all on function public.get_public_store_settings() from public;
grant execute on function public.get_public_store_settings() to anon, authenticated;
