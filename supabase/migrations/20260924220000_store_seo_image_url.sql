-- The dashboard SEO image field uses absolute URLs.
update public.store_settings
set seo=jsonb_set(seo,'{og_image_url}','"https://gh-store.me/storefront/gh-store-social.png"'::jsonb)
where id='global' and seo->>'og_image_url'='/storefront/gh-store-social.png';
