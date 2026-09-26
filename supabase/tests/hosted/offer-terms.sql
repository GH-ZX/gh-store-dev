-- Offer terms review resolution.
--
-- The parser only exists in SQL, so the behaviour that cannot be unit tested in
-- TypeScript is asserted here: that a resolved offer is never re-parsed, that
-- the automatic path still flags ambiguity, and that a purchase keeps the flag
-- it was made under.
do $$
declare
  product_id uuid;
  automatic_id uuid;
  resolved_id uuid;
begin
  insert into public.categories (slug, name_en, name_ar)
  values ('terms-check', 'Terms check', 'فحص الشروط')
  on conflict (slug) do update set name_en = excluded.name_en
  returning id into product_id;

  -- The ambiguity lives on the offer below: a "12-30 days" range, which the
  -- parser refuses to resolve rather than guessing an end of the range.
  insert into public.products (slug, name_en, name_ar, category_id, is_active)
  values ('terms-check-product', 'Terms Check Product', 'منتج فحص الشروط', product_id, true)
  on conflict (slug) do update set name_en = excluded.name_en
  returning id into product_id;

  insert into public.offers (product_id, slug, name_en, name_ar, price, currency, is_active, terms_source)
  values (product_id, 'terms-check-automatic', 'Automatic 12-30 days', 'تلقائي 12-30 يوم', 1, 'USD', true, 'automatic')
  returning id into automatic_id;

  if not exists (select 1 from public.offers where id = automatic_id and terms_review_required) then
    raise exception 'An ambiguous automatic offer must still require review';
  end if;

  -- Resolving as unstated clears the flag and invents nothing.
  update public.offers
  set terms_source = 'unstated', terms_review_required = false,
      terms_reviewed_at = now(), terms_reviewed_by = 'sql-check', terms_review_note = 'No terms published.'
  where id = automatic_id
  returning id into resolved_id;

  if resolved_id is null then
    raise exception 'Resolving to unstated must keep the offer';
  end if;

  if exists (select 1 from public.offers where id = resolved_id and terms_review_required) then
    raise exception 'An unstated offer must not require review';
  end if;

  if exists (
    select 1 from public.offers
    where id = resolved_id
      and (warranty_kind <> 'unknown' or warranty_value is not null or duration_value is not null)
  ) then
    raise exception 'An unstated offer must claim no duration and no warranty';
  end if;

  -- The trap this migration closes: rewriting the offer text must not resurrect
  -- the flag for a source the admin already resolved.
  update public.offers set name_en = 'Automatic 12-30 days (edited)' where id = resolved_id;
  if exists (select 1 from public.offers where id = resolved_id and terms_review_required) then
    raise exception 'A resolved unstated offer must never be re-parsed';
  end if;

  -- Renaming the parent product sweeps automatic offers only, so a resolution
  -- survives a catalog edit.
  update public.products set name_en = 'Terms Check Product Renamed' where id = product_id;
  if exists (select 1 from public.offers where id = resolved_id and terms_review_required) then
    raise exception 'Renaming the product must not re-flag a resolved offer';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.offers'::regclass and conname = 'offers_terms_source_valid'
  ) then
    raise exception 'Missing offers_terms_source_valid constraint';
  end if;

  -- Building a real order just to read a snapshot would fabricate purchases, so
  -- the snapshot is asserted at the definition level instead: it must still copy
  -- the flag, because a purchase made under review stays under review forever.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'snapshot_order_offer_terms'
      and p.prosrc like '%terms_review_required%'
  ) then
    raise exception 'The order snapshot must keep capturing terms_review_required';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.order_items'::regclass
      and tgname = 'order_items_snapshot_terms'
      and not tgisinternal
  ) then
    raise exception 'Missing order_items_snapshot_terms trigger';
  end if;

  -- Leave no fixture behind, so the check can be re-run.
  delete from public.products where id = product_id;

  raise notice 'Offer terms resolution checks passed';
end;
$$;
