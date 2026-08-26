-- A declared delivery shape for every sellable offer.
--
-- Until now whether a buyer had to type anything was an accident of the
-- container: fields hung off `game_input_fields` of the parent game, so two
-- offers under one game could not differ, and a provider product that needs
-- nothing showed whatever its neighbours needed. The providers themselves
-- declare the truth — MaxStore ships `params_meta` per product (name, label,
-- type, required, options) and 338 of its 1857 live products declare none;
-- BatStore tags every product `stock` / `supplier_api` / `activation`, where
-- stock goods deliver instantly and only the other two want an identifier.
--
-- Two columns carry that truth:
--
--   * `delivery_kind` — `account` means the buyer must supply the fields;
--     `direct` means buy and receive: the goods arrive as codes / tokens /
--     activation links in `delivered_payload` with nothing asked first.
--   * `input_fields` — the offer's own field definitions in the same shape as
--     `game_input_fields` rows, for offers whose fields differ from their
--     container. Empty means fall back to the game's fields (for `account`
--     offers imported before this existed).

alter table public.offers
  add column if not exists delivery_kind text not null default 'account';

do $$
begin
  alter table public.offers
    add constraint offers_delivery_kind_check
    check (delivery_kind in ('account', 'direct'));
exception
  when duplicate_object then null;
end $$;

alter table public.offers
  add column if not exists input_fields jsonb not null default '[]'::jsonb;

comment on column public.offers.delivery_kind is
  'account: buyer must complete the offer''s input fields before paying.
   direct: nothing is asked; goods arrive as delivered_payload on the order.';
comment on column public.offers.input_fields is
  'Per-offer buyer input fields, same shape as game_input_fields rows. Checked
   out only when delivery_kind = ''account''; an empty array falls back to the
   parent game''s fields.';

create index if not exists offers_delivery_kind_idx
  on public.offers (delivery_kind)
  where delivery_kind = 'direct';

-- ---- Backfill from what the imports already recorded ------------------------

-- Everything that delivers a code/voucher rather than touching an account:
-- G2Bulk vouchers and gift cards were imported as gift_card/redeem_code.
update public.offers
set delivery_kind = 'direct'
where offer_type in ('gift_card', 'redeem_code')
  and delivery_kind = 'account';

-- BatStore: the product's own delivery_type survives in the mapping metadata.
-- `stock` is pre-purchased inventory delivered the moment the order lands; only
-- supplier_api/activation place goods onto an identifier the buyer supplies.
update public.offers o
set delivery_kind = 'direct'
from public.provider_offer_mappings m
where m.offer_id = o.id
  and m.provider_name = 'batstore'
  and o.delivery_kind = 'account'
  and m.metadata ->> 'delivery_type' = 'stock';

-- MaxStore: products declaring no params need nothing from the buyer. The ones
-- with params keep 'account'; their field definitions arrive with the next
-- catalog re-import, which now writes offers.input_fields.
update public.offers o
set delivery_kind = 'direct'
from public.provider_offer_mappings m
where m.offer_id = o.id
  and m.provider_name = 'maxstore'
  and o.delivery_kind = 'account'
  and coalesce(jsonb_array_length(coalesce(m.metadata -> 'params', '[]'::jsonb)), 0) = 0;
