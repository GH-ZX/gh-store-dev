alter table public.store_settings
  add column if not exists branding jsonb not null default '{}'::jsonb;

alter table public.store_settings
  add constraint store_settings_branding_is_object check (jsonb_typeof(branding) = 'object');

-- Expose to anonymous/authenticated visitors (presentation-safe).
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
    'maintenance_message_en', settings.maintenance_message_en
  )
  from public.store_settings as settings
  where settings.id = 'global';
$$;

revoke all on function public.get_public_store_settings() from public;
grant execute on function public.get_public_store_settings() to anon, authenticated;