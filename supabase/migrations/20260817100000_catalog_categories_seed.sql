-- Seed the storefront categories every import can put products into.
--
-- BatStore products arrive flat — nothing but a name and a price — so the
-- owner picks a home for each at import time. These are those homes. Games and
-- gift cards match the storefront's existing groups; the rest (Design, AI,
-- Productivity, Services, …) cover the flat suppliers that sell access and
-- subscriptions rather than game currency.
--
-- Seeding is idempotent: `slug` is unique, so re-running never duplicates.

insert into public.categories (slug, name_ar, name_en, sort_order, is_active) values
  ('games',            'الألعاب',               'Games',                  10, true),
  ('gift-cards-codes', 'بطاقات وأكواد',         'Gift cards & codes',     20, true),
  ('design',           'تصميم',                 'Design',                 30, true),
  ('ai',               'الذكاء الاصطناعي',      'AI',                     40, true),
  ('productivity',     'إنتاجية',               'Productivity',           50, true),
  ('services',         'خدمات',                 'Services',               60, true)
on conflict (slug) do nothing;
