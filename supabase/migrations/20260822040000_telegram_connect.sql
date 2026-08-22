-- Telegram connect page.
--
-- The bot's "Sign in" button now points at a dedicated site page. The page
-- shows the store's bot username (so customers know which bot to send the
-- code to), which lives inside `store_settings.telegram` — admin-only by RLS.
-- Expose just that one presentation-safe field through the existing
-- security-definer RPC, exactly how branding and contact info are exposed.

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
    )
  )
  from public.store_settings as settings
  where settings.id = 'global';
$$;

revoke all on function public.get_public_store_settings() from public;
grant execute on function public.get_public_store_settings() to anon, authenticated;
