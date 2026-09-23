-- Three independent roles: logo_url, image_url (large), thumbnail_url (small).
-- Null thumbnails follow provider artwork; an admin override survives API updates.
alter table public.products add column if not exists thumbnail_url text;
comment on column public.products.thumbnail_url is 'Optional card/quick-buy image override. Null follows provider image_url, then logo_url.';

alter table public.store_daily_metrics drop constraint store_daily_metrics_event_check;
alter table public.store_daily_metrics add constraint store_daily_metrics_event_check
  check (event in ('catalog_view','product_view','checkout_view','search','search_empty','recharge_view','quick_buy'));
