-- Item 1 + 18: name the in-game currency of every product whose offers are bare denominations.
--
-- Why this matters, in one sentence: 425 of 663 active offers are named only by a
-- supplier denomination ("55", "330", "5567"). The storefront composes the offer
-- label as `<denomination> <points_name>` in `lib/catalog/offer-mapper.ts`
-- (`displayName`), and the product page emits that composed label into the
-- `ItemList` JSON-LD in `routes/locale-product.tsx`. With an empty
-- `points_name`, a shopper and Google both read the product as a number, so the
-- three biggest pages in the catalogue (the Mobile Legends region variants) ship
-- 101–123 offers named "55", "86", "165" and similar.
--
-- Setting `points_name_ar` / `points_name_en` is the whole fix: no code change is
-- required for the storefront or the structured data to start showing
-- "55 Diamonds" / "55 ألماسة". Only PUBG Mobile had a value before this
-- migration, which is why its offers already read "60 UC".
--
-- Scope and safety:
--   * `points_name_*` is presentation only. No price, offer, mapping, stock or
--     order row is touched, so nothing here can affect what a customer is
--     charged or what a supplier is asked for.
--   * Every value is the currency the supplier's own catalogue denomination
--     ladder identifies, which is verified in the verification note at the
--     bottom of this file. Nothing is invented for a product whose offers are
--     already descriptive names (all other 66 products keep an empty value and
--     are unaffected).
--   * `coalesce(name_ar, name_en)` is deliberate: this store has already
--     normalised product names to a single English form across both locales
--     (migration 20261004140000), and the Arabic offer display currently falls
--     back to `name_en` when `name_ar` is empty. Reading the live column instead
--     of hardcoding keeps one source of truth.

-- Mobile Legends: regional server variants, all priced in Diamonds. These are
-- genuinely different regions and must stay separate products; the shared
-- currency name is what they have in common, not a reason to merge them.
update public.products
set points_name_en = 'Diamonds',
    points_name_ar = 'ألماسة'
where slug in ('mlbb', 'mlbb-special', 'mlbb-exclusive');

-- HoYoverse ladder: 60 / 330 / 1090 / 2240 / 3880 / 8080 is the shared
-- premium-currency tier ladder, with the per-title currency name.
update public.products
set points_name_en = 'Genesis Crystals',
    points_name_ar = 'بلورة تكوين'
where slug = 'genshin';

update public.products
set points_name_en = 'Oneiric Shards',
    points_name_ar = 'شظية حلم'
where slug = 'honkai-star-rail';

update public.products
set points_name_en = 'Monochromes',
    points_name_ar = 'مونوكروم'
where slug = 'zzz';

-- Arena Breakout ladder: 66 / 335 / 675 / 1690 / 3400 / 6820 — the in-game
-- currency itself is called "Coins".
update public.products
set points_name_en = 'Coins',
    points_name_ar = 'كوينز'
where slug = 'arena-breakout';

-- Arena Breakout: Infinite is a separate title with its own 100/500/1000…
-- ladder, so it keeps the plain currency word rather than inheriting the
-- mobile title's label.
update public.products
set points_name_en = 'Coins',
    points_name_ar = 'كوينز'
where slug = 'arena-breakout-infinite';

-- Delta Force premium currency, ladder 18 … 24300.
update public.products
set points_name_en = 'Delta Coins',
    points_name_ar = 'دلتا كوين'
where slug = 'deltaforce';

-- Blood Strike ladder 51 / 105 / 320 / 540 / 1100 / 2260 / 5800.
update public.products
set points_name_en = 'Gold',
    points_name_ar = 'ذهب'
where slug = 'bloodstrike';

-- Free Fire: three regional storefronts, one currency name each. Same reasoning
-- as Mobile Legends — different regions, not duplicates.
update public.products
set points_name_en = 'Diamonds',
    points_name_ar = 'ألماسة'
where slug in ('freefire-me', 'freefire-eu', 'freefire-global');

-- PUBG Mobile already carried 'UC' in both locales; restated so this migration
-- is the single authoritative record of every points name and a fresh apply
-- reproduces production exactly.
update public.products
set points_name_en = 'UC',
    points_name_ar = 'UC'
where slug = 'pubgm';

-- Verification note (run after applying, all four must hold):
--   select slug, points_name_en, points_name_ar from public.products
--    where slug in ('mlbb','mlbb-special','mlbb-exclusive','genshin',
--                   'honkai-star-rail','zzz','arena-breakout',
--                   'arena-breakout-infinite','deltaforce','bloodstrike',
--                   'freefire-me','freefire-eu','freefire-global','pubgm')
--    order by slug;
--   -- expects 14 rows with a non-empty value in both columns.
--
--   select count(*) from public.offers o
--     join public.products p on p.id = o.product_id
--    where o.is_active and o.name_en ~ '^[0-9]+$'
--      and coalesce(p.points_name_en, '') = '';
--   -- expects 0: every numeric-only active offer now has a currency name.
--
--   select count(*) from public.offers where is_active;  -- unchanged: 663
--   select count(*) from public.provider_offer_mappings; -- unchanged: 678
--
-- Evidence the labels are the supplier's real denominations rather than a guess
-- (read from the live catalogue before writing this file):
--   mlbb              55,86,165,172,257,275,343,429,514,565,1050…
--   mlbb-special      14,28,55,70,140,165,275,355,429,565,1060…
--   mlbb-exclusive    5,11,22,33,55,112,165,275,565,1018,1275…
--   genshin/zzz/hsr   60,330,1090,2240,3880,8080
--   pubgm             60,325,660,985,1320,1800,2460,3850…  (already labelled UC)
--   freefire-*        25,110,231,583,1188,2420,5600,11500
--   deltaforce        18,30,60,320,460,750,1480,1980,3950,8100,16200,24300
--   arena-breakout    66,335,675,1690,3400,6820,13640,20460
--   bloodstrike       51,105,320,540,1100,2260,5800
