-- Backfill sellable default offers for the 15 products that have no active offer.
--
-- Each product gets a `<product_slug>-standard` digital offer whose names track
-- the parent product, so it stays correct regardless of locale edits.
-- Idempotent: re-running reactivates/refreshes the same 15 rows via the
-- (product_id, slug) unique key.

-- 1. The original offers check constraint only allowed
--    ('topup', 'gift_card', 'redeem_code'); widen it so 'digital' is sellable.
alter table public.offers
  drop constraint if exists offers_offer_type_check;

do $$
begin
  alter table public.offers
    add constraint offers_offer_type_check
    check (offer_type in ('topup', 'gift_card', 'redeem_code', 'digital'));
exception
  when duplicate_object then null;
end;
$$;

-- 2. One active standard offer per product missing an active offer.
insert into public.offers (
  product_id, slug, name_ar, name_en, offer_type,
  price, currency, is_active, delivery_kind
)
select
  p.id,
  p.slug || '-standard',
  p.name_ar,
  p.name_en,
  'digital',
  v.price,
  'USD',
  true,
  v.delivery_kind
from public.products p
join (values
  ('adobe-express-premium-12-months-93',                    15.00::numeric(12, 2), 'account'),
  ('amazon-prime-6-months-video-6-profile-46',               10.00::numeric(12, 2), 'account'),
  ('amazon-prime-video-1-month-160',                          5.00::numeric(12, 2), 'account'),
  ('api-100m-token-claude-3day-88',                          10.00::numeric(12, 2), 'direct'),
  ('api-50m-token-codex-2day-125',                            8.00::numeric(12, 2), 'direct'),
  ('autodesk-education-plan-1-year-51',                      12.00::numeric(12, 2), 'account'),
  ('capcut-pro-1-month-fw-18',                                5.00::numeric(12, 2), 'account'),
  ('gemini-18-months-16',                                    20.00::numeric(12, 2), 'account'),
  ('gmail-4-9-month-old-nw-60',                               5.00::numeric(12, 2), 'direct'),
  ('key-windows-11-pro-retail-87',                           15.00::numeric(12, 2), 'direct'),
  ('lovalbe-pro-lite-1-year-link-20',                        12.00::numeric(12, 2), 'account'),
  ('microsoft-365-family-1-year-invitation-147',              15.00::numeric(12, 2), 'account'),
  ('admin-netflix-4k-premium-1m-5-profile-no-warranty-41',     5.00::numeric(12, 2), 'account'),
  ('nord-vpn',                                               10.00::numeric(12, 2), 'account'),
  ('proton-vpn-plus-1-month-10-devices-94',                   6.00::numeric(12, 2), 'account')
) as v(slug, price, delivery_kind)
  on v.slug = p.slug
on conflict (product_id, slug) do update set
  name_ar       = excluded.name_ar,
  name_en       = excluded.name_en,
  offer_type    = excluded.offer_type,
  price         = excluded.price,
  currency      = excluded.currency,
  is_active     = true,
  delivery_kind = excluded.delivery_kind,
  updated_at    = timezone('utc', now());
