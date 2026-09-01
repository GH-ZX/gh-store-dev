-- Reclassify product_kind for the 37 seeded products. The g2bulk importer
-- hard-coded 'game' for every product; this corrects the internal kind of the
-- non-game products (Gemini/VPN/Netflix etc.) to their true delivery type.
--
-- Runs as the migration role (postgres/service_role) so it bypasses RLS, which
-- only permits anon SELECT on products (publishable-key REST PATCH is ignored).

update public.products
   set product_kind = v.kind
      ,updated_at  = timezone('utc', now())
  from (values
    -- game
    ('arena-breakout','game'),
    ('arena-breakout-infinite','game'),
    ('bloodstrike','game'),
    ('deltaforce','game'),
    ('freefire-eu','game'),
    ('freefire-global','game'),
    ('freefire-me','game'),
    ('genshin','game'),
    ('honkai-star-rail','game'),
    ('mlbb','game'),
    ('mlbb-exclusive','game'),
    ('mlbb-special','game'),
    ('pubgm','game'),
    ('roblox-global','game'),
    ('valorant-riot-cash-turkey','game'),
    ('zzz','game'),
    -- digital
    ('discord','digital'),
    ('key-windows-11-pro-retail-87','digital'),
    ('psn-turkey','digital'),
    ('steam-global','digital'),
    ('xbox-gift-card-turkey','digital'),
    ('gmail-4-9-month-old-nw-60','digital'),
    -- virtual_currency
    ('pubg-mobile-uc-vouchers','virtual_currency'),
    -- subscription
    ('gemini-18-months-16','subscription'),
    ('microsoft-office-365-plus-1-year-35','subscription'),
    ('notion-business-3-months-83','subscription'),
    ('proton-vpn-plus-1-month-10-devices-94','subscription'),
    ('nord-vpn-3months-and-6-months-and-1-year-21','subscription'),
    ('admin-netflix-4k-premium-1m-5-profile-no-warranty-41','subscription'),
    ('capcut-6month-fw-individual-26','subscription'),
    ('capcut-pro-1-month-fw-18','subscription'),
    ('adobe-express-premium-12-months-93','subscription'),
    ('amboss-full-subscription-9-months-109','subscription'),
    ('autodesk-education-plan-1-year-51','subscription'),
    ('figma-pro-edu-2yrs-107','subscription'),
    ('slot-canva-pro-team-edu-invite-5month-warranty-29','subscription'),
    -- service
    ('yalla-live','service')
  ) as v(slug, kind)
 where products.slug = v.slug;
