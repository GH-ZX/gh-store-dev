-- Consolidate duplicate categories:
-- 1. Games: deactivate redundant games-instant-recharge subcategory (0 products)
-- 2. Vouchers: unify gift-cards-codes and games-vouchers into a single top-level "Vouchers" / "قسائم" category

update public.categories
   set slug = 'vouchers',
       name_en = 'Vouchers',
       name_ar = 'قسائم',
       parent_id = null,
       sort_order = 20,
       is_active = true,
       updated_at = timezone('utc', now())
 where id = '803b38c8-f810-4648-bddb-6e4aad2cbbf1'
    or slug = 'gift-cards-codes';

update public.products
   set category_id = (select id from public.categories where slug = 'vouchers'),
       updated_at = timezone('utc', now())
 where category_id in (
   select id from public.categories where slug in ('games-vouchers', 'games-instant-recharge')
 );

update public.categories
   set is_active = false,
       updated_at = timezone('utc', now())
 where slug in ('games-vouchers', 'games-instant-recharge');

update public.store_settings
   set home_layout = (
     select jsonb_agg(
       case
         when elem->>'id' = 'gift_cards' then
           elem || '{"title_en": "Vouchers", "title_ar": "قسائم"}'::jsonb
         else elem
       end
     )
     from jsonb_array_elements(home_layout) elem
   )
 where id = 'global'
   and jsonb_typeof(home_layout) = 'array';
