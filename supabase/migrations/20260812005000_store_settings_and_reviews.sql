-- Store settings hold the admin-controlled storefront configuration.
-- The table itself is never readable by visitors. Public reads go through
-- security-definer functions that expose only presentation-safe keys, so
-- payment and provider configuration can live here without leaking.
create table if not exists public.store_settings (
  id text primary key default 'global',
  home_layout jsonb not null default '[]'::jsonb,
  social_links jsonb not null default '[]'::jsonb,
  seo jsonb not null default '{}'::jsonb,
  contact jsonb not null default '{}'::jsonb,
  theme jsonb not null default '{}'::jsonb,
  payments jsonb not null default '{}'::jsonb,
  providers jsonb not null default '{}'::jsonb,
  maintenance_mode boolean not null default false,
  maintenance_message_ar text,
  maintenance_message_en text,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint store_settings_singleton_check check (id = 'global'),
  constraint store_settings_home_layout_is_array check (jsonb_typeof(home_layout) = 'array'),
  constraint store_settings_social_links_is_array check (jsonb_typeof(social_links) = 'array'),
  constraint store_settings_seo_is_object check (jsonb_typeof(seo) = 'object'),
  constraint store_settings_contact_is_object check (jsonb_typeof(contact) = 'object'),
  constraint store_settings_theme_is_object check (jsonb_typeof(theme) = 'object')
);

insert into public.store_settings (id)
values ('global')
on conflict (id) do nothing;

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  display_name text not null,
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(btrim(body)) > 0),
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  is_featured boolean not null default false,
  admin_note text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists reviews_public_idx
  on public.reviews (is_featured desc, created_at desc)
  where status = 'approved';
create index if not exists reviews_status_created_idx
  on public.reviews (status, created_at desc);
create index if not exists reviews_user_created_idx
  on public.reviews (user_id, created_at desc);

drop trigger if exists store_settings_set_updated_at on public.store_settings;
create trigger store_settings_set_updated_at
before update on public.store_settings
for each row
execute function public.set_updated_at();

drop trigger if exists reviews_set_updated_at on public.reviews;
create trigger reviews_set_updated_at
before update on public.reviews
for each row
execute function public.set_updated_at();

alter table public.store_settings enable row level security;
alter table public.reviews enable row level security;

drop policy if exists store_settings_admin_all on public.store_settings;
create policy store_settings_admin_all
on public.store_settings
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists reviews_select_public_approved on public.reviews;
create policy reviews_select_public_approved
on public.reviews
for select
to anon, authenticated
using (status = 'approved');

drop policy if exists reviews_select_own on public.reviews;
create policy reviews_select_own
on public.reviews
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists reviews_insert_own on public.reviews;
create policy reviews_insert_own
on public.reviews
for insert
to authenticated
with check (
  user_id = auth.uid()
  and status = 'pending'
  and is_featured = false
);

drop policy if exists reviews_admin_all on public.reviews;
create policy reviews_admin_all
on public.reviews
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- Presentation-safe settings for anonymous visitors. Payment, provider, and
-- audit columns are deliberately excluded from the returned object.
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
    'maintenance_mode', settings.maintenance_mode,
    'maintenance_message_ar', settings.maintenance_message_ar,
    'maintenance_message_en', settings.maintenance_message_en
  )
  from public.store_settings as settings
  where settings.id = 'global';
$$;

create or replace function public.get_home_layout()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(settings.home_layout, '[]'::jsonb)
  from public.store_settings as settings
  where settings.id = 'global';
$$;

revoke all on function public.get_public_store_settings() from public;
revoke all on function public.get_home_layout() from public;
grant execute on function public.get_public_store_settings() to anon, authenticated;
grant execute on function public.get_home_layout() to anon, authenticated;

grant select on public.reviews to anon, authenticated;
grant select, insert on public.reviews to authenticated;
grant select, insert, update, delete on public.store_settings to authenticated;
grant update, delete on public.reviews to authenticated;
