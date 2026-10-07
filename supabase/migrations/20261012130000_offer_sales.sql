-- 20261012130000_offer_sales.sql
-- Add flash sale price and scheduling columns to offers.

alter table public.offers
  add column if not exists sale_price numeric(12, 2) default null,
  add column if not exists sale_starts_at timestamptz default null,
  add column if not exists sale_ends_at timestamptz default null;

comment on column public.offers.sale_price is 'Promotional flash sale price in offer currency.';
comment on column public.offers.sale_starts_at is 'UTC start timestamp for flash sale price activation.';
comment on column public.offers.sale_ends_at is 'UTC end timestamp for flash sale price expiration.';

create index if not exists idx_offers_sale_active
  on public.offers (sale_starts_at, sale_ends_at)
  where sale_price is not null;
