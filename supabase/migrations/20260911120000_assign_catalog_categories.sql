-- Assign the imported catalogue to the store's categories.
--
-- Provider imports create `products` rows without a `category_id`, so the
-- store's category pages returned empty lists. This maps every uncategorized
-- product to the category that matches what it actually sells. The admin can
-- still re-categorize any product from the dashboard catalog.
--
-- Slugs are stable provider-derived identifiers; category ids are the
-- canonical seed ids. Only rows still missing a category are touched, so
-- re-running never overrides a manual re-categorization.

update public.products
set category_id = '79b2537a-e96a-4f23-9a92-7a2b5fd1640e',
    updated_at = timezone('utc', now())
where category_id is null
  and slug in (
    'admin-gemini-pro-drive-5tb-1-year-162',
    'api-100m-token-claude-3day-88',
    'api-100m-token-codex-3day-127',
    'api-10m-token-claude-1day-warranty-85',
    'api-50m-token-codex-2day-125',
    'api-claude-50m-token-2day-96',
    'brain-fm-1-year-174',
    'claude-100-api-30-d-warranty-101',
    'cursor-pro-12m-166',
    'descript-creator-1-year-175',
    'elevenlabs-elevenlabs-free-10k-credits-w24h-75',
    'elevenlabs-creator-12m-167',
    'gamma-ai-plus-1m-w25d-163',
    'gamma-pro-12m-123',
    'grok-super-grok-7-days-w5d-128',
    'lovable-pro-12m-171',
    'lovalbe-pro-lite-1-year-link-20',
    'manus-pro-1-year-non-warranty-177',
    'manus-pro-12m-114'
  );

update public.products
set category_id = 'f585218e-5392-4529-a31c-3b44f904619f',
    updated_at = timezone('utc', now())
where category_id is null
  and slug in (
    'adobe-express-premium-12-months-93',
    'capcut-6month-fw-individual-26',
    'capcut-pro-1-month-fw-18',
    'figma-pro-edu-2yrs-107',
    'framer-pro-1-year-178',
    'framer-pro-12m-122',
    'magic-patterns-starter-12m-170',
    'meitu-svip-meitu-svip-1m-w25d-153',
    'miro-edu-lifetime-access-100-members-151',
    'mobbin-10x-seat-12m-169',
    'slot-canva-pro-team-edu-invite-5month-warranty-29'
  );

update public.products
set category_id = 'b41de915-40c9-49de-9951-f7c694c5a911',
    updated_at = timezone('utc', now())
where category_id is null
  and slug in (
    'amboss-full-subscription-9-months-109',
    'autodesk-admin-dashboard-access-3000-invitation-150',
    'autodesk-education-plan-1-year-51',
    'cousera-bussiness-6m-ready-account-161',
    'duolingo-super-slot-12-months-156',
    'ilovepdf-premium-1yr-105',
    'jetbrains-edu-1-year-139',
    'key-windows-11-pro-retail-87',
    'key-windows-10-pro-retail-98',
    'linear-business-1-year-173',
    'microsoft-365-family-1-year-invitation-147',
    'microsoft-office-365-plus-1-year-35',
    'n8n-starter-12m-168',
    'notion-business-3-months-83',
    'notion-business-1-year-non-warranty-179',
    'quillbot-1-month-183',
    'quizlet-plus-12m-fw-137',
    'quizlet-plus-ultimate-12m-fw-138',
    'scribd-scribd-premium-1m-fw-134',
    'zoom-12-months-100-people-131',
    'zoom-3-months-100-people-130',
    'zoom-6-months-100-people-132',
    'zoom-zoom-pro-1m-w25d-ready-account-129'
  );

update public.products
set category_id = '6cb6c5cd-76fe-447b-b456-94b1a30ff151',
    updated_at = timezone('utc', now())
where category_id is null
  and slug in (
    '1-mtn-14',
    'amazon-prime-6-months-video-6-profile-46',
    'amazon-prime-video-1-month-160',
    'apple-tv-official-subscriptions-12m-fw-145',
    'gmail-4-9-month-old-nw-60',
    'hma-key-hma-android-pc-20-30d-143',
    'admin-netflix-4k-premium-1m-5-profile-no-warranty-41',
    'nord-vpn',
    'peacock-official-subscriptions-1year-152',
    'proton-vpn-plus-1-month-10-devices-94',
    'railway-hobby-12m-182',
    'replit-core-12m-121',
    'shahid-vip-subscription-features-3-months-111',
    'spotify-3m-redeem-link-164'
  );
