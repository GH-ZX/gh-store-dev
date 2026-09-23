-- Non-destructive catalog enrichment. Imports use the same triggers as admin writes.
alter table public.products add column if not exists search_aliases text[] not null default '{}';
alter table public.products add column if not exists search_text text not null default '';
alter table public.offers
  add column if not exists duration_value integer,
  add column if not exists duration_unit text,
  add column if not exists warranty_kind text not null default 'unknown',
  add column if not exists warranty_value integer,
  add column if not exists warranty_unit text,
  add column if not exists terms_source text not null default 'automatic',
  add column if not exists terms_review_required boolean not null default false;
alter table public.offers add constraint offers_duration_valid check (
  (duration_value is null and duration_unit is null) or
  (duration_value is not null and duration_unit is not null and duration_value between 1 and 1200 and duration_unit in ('hour','day','month','year'))
);
alter table public.offers add constraint offers_warranty_valid check (
  (warranty_kind in ('unknown','full') and warranty_value is null and warranty_unit is null) or
  (warranty_kind = 'none' and warranty_value is not null and warranty_unit is not null and warranty_value = 0 and warranty_unit = 'day') or
  (warranty_kind = 'fixed' and warranty_value is not null and warranty_unit is not null and warranty_value between 1 and 1200 and warranty_unit in ('hour','day','month','year'))
);
alter table public.offers add constraint offers_terms_source_valid check (terms_source in ('automatic','manual'));

create or replace function public.catalog_normalize(value text) returns text
language sql immutable strict set search_path = '' as $$
  select lower(translate(regexp_replace(value, '[ـًٌٍَُِّْٰ]', '', 'g'), 'أإآٱى', 'ااااي'));
$$;

create or replace function public.catalog_aliases(value text) returns text[]
language plpgsql immutable set search_path = '' as $$
declare result text[] := '{}'; r record;
begin
  for r in select * from (values
    ('discord','ديسكورد,دسكورد,discord,nitro,نيترو'),
    ('chatgpt|chat.?gpt|openai','شات جي بي تي,شات جيبتي,chatgpt,openai,اوبن اي اي'),
    ('gemini','جيميني,جيمناي,gemini'), ('google','جوجل,غوغل,google'),
    ('youtube','يوتيوب,youtube'), ('netflix','نتفليكس,نتفلكس,netflix'),
    ('spotify','سبوتيفاي,spotify'), ('canva','كانفا,canva'),
    ('capcut','كاب كت,كابكات,capcut'), ('apple','ابل,آبل,apple'),
    ('icloud','اي كلاود,icloud'), ('microsoft','مايكروسوفت,microsoft'),
    ('office','اوفيس,office'), ('windows','ويندوز,windows'),
    ('adobe','ادوبي,أدوبي,adobe'), ('photoshop','فوتوشوب,photoshop'),
    ('playstation|psn','بلايستيشن,بلاي ستيشن,playstation,psn'),
    ('xbox','اكس بوكس,xbox'), ('steam','ستيم,steam'),
    ('pubg','ببجي,بوبجي,pubg'), ('roblox','روبلوكس,roblox'),
    ('arena.?breakout','ارينا بريك اوت,arena breakout'),
    ('free.?fire','فري فاير,free fire'), ('valorant','فالورانت,valorant'),
    ('fortnite','فورتنايت,fortnite'), ('genshin','جينشن,قنشن,genshin'),
    ('mobile.?legends','موبايل ليجند,موبايل ليجندز,mobile legends'),
    ('clash','كلاش,clash'), ('tiktok','تيك توك,tiktok'),
    ('telegram','تيليجرام,تلغرام,telegram'), ('duolingo','دولينجو,duolingo'),
    ('elevenlabs','اليفن لابز,elevenlabs'), ('perplexity','بيربلكسيتي,perplexity'),
    ('claude','كلود,claude'), ('cursor','كيرسر,كورسور,cursor'),
    ('midjourney','ميدجورني,midjourney'), ('linkedin','لينكد ان,linkedin'),
    ('grammarly','جرامرلي,grammarly'), ('notion','نوشن,notion'),
    ('crunchyroll','كرانشي رول,crunchyroll'), ('prime','برايم,prime'),
    ('amazon','امازون,amazon'), ('mtn','ام تي ان,mtn'),
    ('syriatel','سيريتل,syriatel'), ('shahid','شاهد,shahid'),
    ('amboss','امبوس,amboss'), ('autodesk','اوتوديسك,autodesk'),
    ('blood.?strike','بلود سترايك,blood strike'), ('cou?rsera|cousera','كورسيرا,coursera'),
    ('delta.?force','دلتا فورس,delta force'), ('descript','ديسكريبت,descript'),
    ('factory','فاكتوري,factory'), ('figma','فيجما,figma'), ('framer','فريمر,framer'),
    ('gamma','جاما,غاما,gamma'), ('gmail','جيميل,gmail'), ('hma','اتش ام اي,hma'),
    ('honkai','هونكاي,honkai'), ('ilovepdf','اي لاف بي دي اف,ilovepdf'),
    ('linear','لينير,linear'), ('lovable|lovalbe','لوفابل,lovable'),
    ('magic.?patterns','ماجيك باترنز,magic patterns'), ('manus','مانوس,manus'),
    ('meitu','ميتو,meitu'), ('miro','ميرو,miro'), ('mobbin','موبين,mobbin'),
    ('n8n','ان ايت ان,n8n'), ('nord','نورد,nord'), ('peacock','بيكوك,peacock'),
    ('proton','بروتون,proton'), ('quillbot','كويل بوت,quillbot'), ('quizlet','كويزلت,quizlet'),
    ('railway','ريلواي,railway'), ('replit','ريبليت,replit'), ('scribd','سكريبد,scribd'),
    ('yalla','يلا,yalla'), ('zenless','زينليس,zenless'), ('zoom','زوم,zoom'),
    ('brain.fm','برين اف ام,brain.fm'), ('subscription','اشتراك,subscription'),
    ('gift.?card','بطاقة هدية,gift card'), ('vpn','في بي ان,vpn')
  ) as aliases(pattern, terms) loop
    if lower(value) ~ r.pattern then result := result || string_to_array(r.terms, ','); end if;
  end loop;
  return result;
end $$;

create or replace function public.enrich_product_discovery() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Preserve editable aliases on every provider sync; add relevant new aliases.
  if TG_OP = 'INSERT' or new.name_en is distinct from old.name_en or new.name_ar is distinct from old.name_ar then
    select coalesce(array_agg(distinct btrim(v)) filter(where btrim(v) <> ''), '{}') into new.search_aliases
    from unnest(new.search_aliases || array[new.name_en, new.name_ar, replace(new.slug,'-',' ')] || public.catalog_aliases(new.name_en || ' ' || new.name_ar)) v;
  end if;
  new.search_text := public.catalog_normalize(concat_ws(' ',new.name_ar,new.name_en,new.slug,array_to_string(new.search_aliases,' '),left(new.description_ar,4000),left(new.description_en,4000)));
  return new;
end $$;
create trigger products_discovery_before_write before insert or update of name_ar,name_en,slug,description_ar,description_en,search_aliases on public.products for each row execute function public.enrich_product_discovery();

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

create or replace function public.enrich_offer_terms() returns trigger
language plpgsql set search_path = '' as $$
declare parent_text text; parsed jsonb; own_text text;
begin
  if new.terms_source = 'manual' then return new; end if;
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
create trigger offers_terms_before_write before insert or update of name_en,name_ar,description_en,description_ar,product_id,terms_source on public.offers for each row execute function public.enrich_offer_terms();
-- Backfill every existing product and offer, preserving names, prices, mappings and slugs.
update public.products set search_aliases = array(select distinct v from unnest(search_aliases || array[name_ar,name_en,replace(slug,'-',' ')] || public.catalog_aliases(name_en || ' ' || name_ar)) v);
update public.offers set terms_source = terms_source where terms_source = 'automatic';

-- Preserve what the customer purchased even when suppliers later change their terms.
create or replace function public.snapshot_order_offer_terms() returns trigger
language plpgsql set search_path = '' as $$
declare terms jsonb;
begin
  select jsonb_build_object('duration_value',duration_value,'duration_unit',duration_unit,'warranty_kind',warranty_kind,'warranty_value',warranty_value,'warranty_unit',warranty_unit,'terms_review_required',terms_review_required) into terms from public.offers where id = new.offer_id;
  new.metadata := coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object('offer_terms',terms);
  return new;
end $$;
create trigger order_items_snapshot_terms before insert on public.order_items for each row execute function public.snapshot_order_offer_terms();

create or replace function public.refresh_product_offer_terms() returns trigger
language plpgsql set search_path = '' as $$
begin
  update public.offers set terms_source = terms_source where product_id = new.id and terms_source = 'automatic';
  return new;
end $$;
create trigger products_refresh_offer_terms after update of name_en,name_ar,description_en,description_ar on public.products for each row when (old.name_en is distinct from new.name_en or old.name_ar is distinct from new.name_ar or old.description_en is distinct from new.description_en or old.description_ar is distinct from new.description_ar) execute function public.refresh_product_offer_terms();
