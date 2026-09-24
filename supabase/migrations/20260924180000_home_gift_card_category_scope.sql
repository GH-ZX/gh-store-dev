-- The legacy gift_cards offer-type filter includes unrelated subscriptions.
-- Scope the existing shelf to its catalog category, preserving owner selections.
update public.store_settings s
set home_layout = (
  select coalesce(
    jsonb_agg(case when entry->>'type' = 'gift_cards'
      and case when jsonb_typeof(entry->'category_ids') = 'array' then jsonb_array_length(entry->'category_ids') = 0 else true end
      then entry || jsonb_build_object('category_ids', jsonb_build_array(c.id))
      else entry end order by ordinal),
    '[]'::jsonb
  )
  from jsonb_array_elements(s.home_layout) with ordinality as items(entry,ordinal)
)
from public.categories c
where s.id='global' and c.slug='gift-cards-codes' and jsonb_typeof(s.home_layout)='array';
