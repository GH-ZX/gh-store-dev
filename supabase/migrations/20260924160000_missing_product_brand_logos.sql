-- Fill missing brand identities only; keep every existing owner-selected logo.
update public.products set logo_url='/storefront/brands/gemini.svg'
where (logo_url is null or btrim(logo_url)='') and lower(name_en) ~ '^gemini([[:space:]]|$)';
update public.products set logo_url='/storefront/brands/chatgpt.svg'
where (logo_url is null or btrim(logo_url)='') and lower(name_en) ~ '^chatgpt([[:space:]]|$)';
update public.products p set logo_url=source.logo_url
from (select logo_url from public.products where slug='capcut-pro-1-month-fw-18' and logo_url is not null) source
where (p.logo_url is null or btrim(p.logo_url)='') and lower(p.name_en) ~ '^capcut([[:space:]]|$)';
