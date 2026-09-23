-- Fill only missing categories, preserving the owner's existing assignments.
with mapping(product_slug,category_slug) as (values
  ('apple-tv-official-subscriptions-6m-fw-146','services'),
  ('capcut-pro-7-days-97','design'),
  ('chatgpt-plus-1m-momo-pay-gmail-nw-89','ai'),
  ('factory-pro-1-year-176','ai')
)
update public.products p set category_id=c.id
from mapping m join public.categories c on c.slug=m.category_slug
where p.slug=m.product_slug and p.category_id is null;

-- A featured review is not necessarily a verified purchase.
alter table public.reviews add column is_verified_purchase boolean not null default false;
create or replace function public.verify_review_purchase() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.is_verified_purchase := exists(select 1 from public.orders o where o.id=new.order_id and o.user_id=new.user_id and o.status='completed' and o.payment_status='paid');
  return new;
end $$;
create trigger reviews_verify_purchase before insert or update of order_id,user_id,is_verified_purchase on public.reviews for each row execute function public.verify_review_purchase();
update public.reviews set is_verified_purchase=is_verified_purchase;
create or replace function public.parse_catalog_terms(value text) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  t text := lower(coalesce(value,'')); m text[]; units text[] := '{}'; amounts integer[] := '{}';
  warranty text := 'unknown'; wv integer := null; wu text := null; dv integer := null; du text := null;
  no_w boolean; full_w boolean; fixed_count integer := 0; review boolean := false; n integer; u text;
begin
  review := t ~ '[0-9]+\s*[-–]\s*[0-9]+\s*(d|days?|m|months?)\M';
  no_w := t ~ '(^|[^a-z])nw([^a-z]|$)|non?[ -]+warranty|without[ -]+warranty|بدون ضمان|بلا ضمان';
  full_w := t ~ '(^|[^a-z])fw([^a-z]|$)|full[ -]+warranty|ضمان كامل';
  for m in select regexp_matches(t, '(?:\mw\s*|warranty\s*[:=-]?\s*|ضمان\s*)([0-9]{1,4})\s*(hours?|hrs?|h|days?|d|months?|m|years?|y|ساعة|ساعات|يوم|ايام|أيام|شهر|أشهر|اشهر|سنة|سنوات)\M', 'g') loop
    n := m[1]::integer; u := case when m[2] ~ '^(h|سا)' then 'hour' when m[2] ~ '^(d|يوم|[اأ]يام)' then 'day' when m[2] ~ '^(m|شهر|[اأ]شهر)' then 'month' else 'year' end;
    if fixed_count > 0 and (wv <> n or wu <> u) then review := true; end if;
    wv := n; wu := u; fixed_count := fixed_count + 1;
    if n < 1 or n > 1200 then review := true; end if;
  end loop;
  -- Million-token quotas are not subscription months.
  t := regexp_replace(t, '\m[0-9]+\s*m\s*(tokens?|credits?)\M', ' ', 'g');
  -- Remove warranty clauses before finding subscription duration.
  t := regexp_replace(t, '(\mw\s*|warranty\s*[:=-]?\s*|ضمان\s*)[0-9]{1,4}\s*(hours?|hrs?|h|days?|d|months?|m|years?|y|ساعة|ساعات|يوم|ايام|أيام|شهر|أشهر|اشهر|سنة|سنوات)\M', ' ', 'g');
  for m in select regexp_matches(t, '\m([0-9]{1,4})\s*(months?|mo|m|years?|yrs?|y|days?|d|hours?|h|شهر|أشهر|اشهر|سنة|سنوات)\M', 'g') loop
    n := m[1]::integer; u := case when m[2] ~ '^(m|شهر|[اأ]شهر)' then 'month' when m[2] ~ '^d' then 'day' when m[2] ~ '^h' then 'hour' else 'year' end;
    if dv is not null and (dv <> n or du <> u) then review := true; end if;
    dv := n; du := u;
    if n < 1 or n > 1200 then dv := null; du := null; review := true; end if;
  end loop;
  if (no_w::integer + full_w::integer + (fixed_count > 0)::integer) > 1 then review := true; end if;
  if review then warranty := 'unknown'; wv := null; wu := null; dv := null; du := null;
  elsif no_w then warranty := 'none'; wv := 0; wu := 'day';
  elsif full_w then warranty := 'full'; wv := null; wu := null; if dv is null then review := true; end if;
  elsif fixed_count > 0 then warranty := 'fixed';
  end if;
  return jsonb_build_object('duration_value',dv,'duration_unit',du,'warranty_kind',warranty,'warranty_value',wv,'warranty_unit',wu,'terms_review_required',review);
end $$;

update public.offers set terms_source=terms_source where terms_source='automatic';
