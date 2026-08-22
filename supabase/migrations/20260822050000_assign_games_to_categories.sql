-- Assign the imported catalogue to the store's categories.
--
-- Provider imports create `games` rows without a `category_id` (the G2Bulk
-- import deliberately skips it), so the store's category pages and the
-- Telegram bot's category -> games flow both returned empty lists. This maps
-- every active game to the category that matches what it actually sells.
-- The admin can still re-categorize any game from the dashboard catalog.

update public.games
set category_id = (select id from public.categories where slug = 'games')
where slug in (
  'arena-breakout',
  'arena-breakout-infinite',
  'bloodstrike',
  'deltaforce',
  'freefire-eu',
  'freefire-global',
  'freefire-me',
  'genshin',
  'honkai-star-rail',
  'mlbb',
  'mlbb-exclusive',
  'mlbb-special',
  'psn-turkey',
  'pubgm',
  'pubg-mobile-uc-vouchers',
  'roblox-global',
  'steam-global',
  'valorant-riot-cash-turkey',
  'xbox-gift-card-turkey',
  'yalla-live',
  'zzz'
);

update public.games
set category_id = (select id from public.categories where slug = 'gift-cards-codes')
where slug in ('discord');

update public.games
set category_id = (select id from public.categories where slug = 'design')
where slug in (
  'autodesk-education-plan-1-year-51',
  'capcut-6month-fw-individual-26',
  'capcut-pro-1-month-fw-18',
  'capcut-pro-7-days-97',
  'slot-canva-pro-team-edu-invite-5month-warranty-29'
);

update public.games
set category_id = (select id from public.categories where slug = 'ai')
where slug in ('gemini-18-months-16');

update public.games
set category_id = (select id from public.categories where slug = 'productivity')
where slug in (
  'key-windows-11-pro-retail-87',
  'microsoft-office-365-plus-1-year-35',
  'nord-vpn-3months-and-6-months-and-1-year-21',
  'notion-business-3-months-83',
  'proton-vpn-plus-1-month-10-devices-94'
);

update public.games
set category_id = (select id from public.categories where slug = 'services')
where slug in ('gmail-4-9-month-old-nw-60');
