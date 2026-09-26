-- Let an admin resolve an ambiguous offer honestly.
--
-- Until now the only way to clear offers.terms_review_required was to declare
-- 'manual' terms, which forced a warranty value the supplier never stated. An
-- admin who correctly concludes "this supplier publishes no terms" had no honest
-- option, so the queue was either stuck or cleared with an invented warranty.
--
-- 'unstated' records exactly that: the supplier states nothing, so there is no
-- duration and no warranty claim. It is a resolution, not a claim.
alter table public.offers
  add column if not exists terms_reviewed_at timestamptz,
  add column if not exists terms_reviewed_by text,
  add column if not exists terms_review_note text;

comment on column public.offers.terms_reviewed_at is 'When an admin last resolved the terms review flag.';
comment on column public.offers.terms_reviewed_by is 'Admin who resolved the terms review flag.';
comment on column public.offers.terms_review_note is 'Why the offer was resolved; required for the unstated source.';

alter table public.offers drop constraint if exists offers_terms_source_valid;
alter table public.offers add constraint offers_terms_source_valid check (terms_source in ('automatic','manual','unstated'));

-- Re-issue the writer trigger so a resolved offer is never re-parsed. Without
-- this, 'unstated' rows fall through to the parser and the flag returns on the
-- next write, which is the trap this migration exists to close.
create or replace function public.enrich_offer_terms() returns trigger
language plpgsql set search_path = '' as $$
declare parent_text text; parsed jsonb; own_text text;
begin
  -- 'manual' and 'unstated' are both deliberate admin decisions.
  if new.terms_source in ('manual','unstated') then return new; end if;
  select concat_ws(' ',name_en,name_ar,description_en,description_ar) into parent_text from public.products where id = new.product_id;
  own_text := concat_ws(' ',new.name_en,new.name_ar,new.description_en,new.description_ar);
  parsed := public.parse_catalog_terms(own_text);
  -- Parent terms apply only when the offer has no explicit terms of its own.
  if parsed->>'duration_value' is null and parsed->>'warranty_kind' = 'unknown' and not (parsed->>'terms_review_required')::boolean then
    parsed := public.parse_catalog_terms(parent_text);
  end if;
  new.duration_value := (parsed->>'duration_value')::integer;
  new.duration_unit := parsed->>'duration_unit';
  new.warranty_kind := parsed->>'warranty_kind';
  new.warranty_value := (parsed->>'warranty_value')::integer;
  new.warranty_unit := parsed->>'warranty_unit';
  new.terms_review_required := (parsed->>'terms_review_required')::boolean;
  return new;
end $$;

-- refresh_product_offer_terms already sweeps only 'automatic' offers, so a
-- resolved 'unstated' offer keeps its decision when the parent product is
-- renamed. Nothing to change there; asserted in the SQL check instead.
