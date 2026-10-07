-- Split legacy "services" into 4 distinct single-word categories:
-- 1. Streaming (بث)
-- 2. VPN (VPN)
-- 3. Recharge Balance (تعبئة رصيد)
-- 4. Developing (برمجة)

-- 1. Transform legacy 'services' into 'streaming'
update public.categories
   set slug = 'streaming',
       name_en = 'Streaming',
       name_ar = 'بث',
       sort_order = 60,
       is_active = true,
       updated_at = timezone('utc', now())
 where slug = 'services' or id = '6cb6c5cd-76fe-447b-b456-94b1a30ff151';

-- 2. Insert VPN category
insert into public.categories (id, slug, name_en, name_ar, sort_order, is_active)
values ('141c4428-80f9-429f-86b5-ef3b796d6214', 'vpn', 'VPN', 'VPN', 70, true)
on conflict (slug) do update
   set name_en = excluded.name_en,
       name_ar = excluded.name_ar,
       sort_order = excluded.sort_order,
       is_active = excluded.is_active;

-- 3. Insert Recharge Balance category
insert into public.categories (id, slug, name_en, name_ar, sort_order, is_active)
values ('afa7892c-2a90-4dbd-935c-aea422db5d5a', 'recharge-balance', 'Recharge Balance', 'تعبئة رصيد', 80, true)
on conflict (slug) do update
   set name_en = excluded.name_en,
       name_ar = excluded.name_ar,
       sort_order = excluded.sort_order,
       is_active = excluded.is_active;

-- 4. Insert Developing category
insert into public.categories (id, slug, name_en, name_ar, sort_order, is_active)
values ('7530a08a-fc56-49c7-83a0-f6c3206121cb', 'developing', 'Developing', 'برمجة', 90, true)
on conflict (slug) do update
   set name_en = excluded.name_en,
       name_ar = excluded.name_ar,
       sort_order = excluded.sort_order,
       is_active = excluded.is_active;

-- 5. Reassign VPN products
update public.products
   set category_id = (select id from public.categories where slug = 'vpn'),
       updated_at = timezone('utc', now())
 where slug in ('expressvpn-private-5-devices-30d-27', 'nord-vpn', 'proton-vpn-plus-1-month-10-devices-94', 'hma-key-hma-android-pc-20-30d-143');

-- 6. Reassign Recharge Balance products
update public.products
   set category_id = (select id from public.categories where slug = 'recharge-balance'),
       updated_at = timezone('utc', now())
 where slug in ('1-mtn-14');

-- 7. Reassign Developing products
update public.products
   set category_id = (select id from public.categories where slug = 'developing'),
       updated_at = timezone('utc', now())
 where slug in ('replit-core-12m-121', 'railway-hobby-12m-182', 'gmail-4-9-month-old-nw-60');
