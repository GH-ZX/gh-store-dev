-- Catalog artwork backfill for provider-imported products.
--
-- Provider imports create `products` rows without an `image_url`, so these
-- 43 products rendered without artwork on category pages, product cards,
-- and the Telegram bot catalog. Each UPDATE below pins a clean,
-- high-quality brand logo by exact slug:
--   * brands shipped by Simple Icons use the official Simple Icons SVG
--     served over the jsDelivr CDN (verified to resolve);
--   * brands without a Simple Icons entry fall back to the brand's own
--     official favicon via Google's favicon service (verified to resolve).
-- The admin can still override any artwork from the dashboard catalog.

-- MTN airtime (no Simple Icons entry; official MTN favicon).
update public.products
set image_url = 'https://www.google.com/s2/favicons?domain=mtn.com&sz=128'
where slug = '1-mtn-14';

-- Google Gemini.
update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/googlegemini.svg'
where slug = 'admin-gemini-pro-drive-5tb-1-year-162';

-- Amazon Prime Video.
update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/amazonprime.svg'
where slug = 'amazon-prime-6-months-video-6-profile-46';

update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/amazonprime.svg'
where slug = 'amazon-prime-video-1-month-160';

-- Anthropic Claude API products.
update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/claude.svg'
where slug = 'api-100m-token-claude-3day-88';

update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/claude.svg'
where slug = 'api-10m-token-claude-1day-warranty-85';

update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/claude.svg'
where slug = 'api-claude-50m-token-2day-96';

update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/claude.svg'
where slug = 'claude-100-api-30-d-warranty-101';

-- OpenAI Codex API products.
update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/openai.svg'
where slug = 'api-100m-token-codex-3day-127';

update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/openai.svg'
where slug = 'api-50m-token-codex-2day-125';

-- Apple TV.
update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/appletv.svg'
where slug = 'apple-tv-official-subscriptions-12m-fw-145';

-- Autodesk.
update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/autodesk.svg'
where slug = 'autodesk-admin-dashboard-access-3000-invitation-150';

-- Brain.fm (no Simple Icons entry; official Brain.fm favicon).
update public.products
set image_url = 'https://www.google.com/s2/favicons?domain=brain.fm&sz=128'
where slug = 'brain-fm-1-year-174';

-- Coursera.
update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/coursera.svg'
where slug = 'cousera-bussiness-6m-ready-account-161';

-- Cursor.
update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/cursor.svg'
where slug = 'cursor-pro-12m-166';

-- Descript (no Simple Icons entry; official Descript favicon).
update public.products
set image_url = 'https://www.google.com/s2/favicons?domain=descript.com&sz=128'
where slug = 'descript-creator-1-year-175';

-- Duolingo.
update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/duolingo.svg'
where slug = 'duolingo-super-slot-12-months-156';

-- ElevenLabs.
update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/elevenlabs.svg'
where slug = 'elevenlabs-creator-12m-167';

-- ExpressVPN.
update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/expressvpn.svg'
where slug = 'expressvpn-private-5-devices-30d-27';

-- Framer.
update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/framer.svg'
where slug = 'framer-pro-1-year-178';

update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/framer.svg'
where slug = 'framer-pro-12m-122';

-- Gamma (no Simple Icons entry; official Gamma favicon).
update public.products
set image_url = 'https://www.google.com/s2/favicons?domain=gamma.app&sz=128'
where slug = 'gamma-pro-12m-123';

-- iLovePDF (no Simple Icons entry; official iLovePDF favicon).
update public.products
set image_url = 'https://www.google.com/s2/favicons?domain=ilovepdf.com&sz=128'
where slug = 'ilovepdf-premium-1yr-105';

-- JetBrains.
update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/jetbrains.svg'
where slug = 'jetbrains-edu-1-year-139';

-- Windows 10.
update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/windows10.svg'
where slug = 'key-windows-10-pro-retail-98';

-- Linear.
update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/linear.svg'
where slug = 'linear-business-1-year-173';

-- Lovable (no Simple Icons entry; official Lovable favicon).
update public.products
set image_url = 'https://www.google.com/s2/favicons?domain=lovable.dev&sz=128'
where slug = 'lovable-pro-12m-171';

-- Magic Patterns (no Simple Icons entry; official Magic Patterns favicon).
update public.products
set image_url = 'https://www.google.com/s2/favicons?domain=magicpatterns.com&sz=128'
where slug = 'magic-patterns-starter-12m-170';

-- Manus (no Simple Icons entry; official Manus favicon).
update public.products
set image_url = 'https://www.google.com/s2/favicons?domain=manus.im&sz=128'
where slug = 'manus-pro-1-year-non-warranty-177';

update public.products
set image_url = 'https://www.google.com/s2/favicons?domain=manus.im&sz=128'
where slug = 'manus-pro-12m-114';

-- Microsoft 365.
update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/microsoftoffice.svg'
where slug = 'microsoft-365-family-1-year-invitation-147';

-- Miro.
update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/miro.svg'
where slug = 'miro-edu-lifetime-access-100-members-151';

-- Mobbin (no Simple Icons entry; official Mobbin favicon).
update public.products
set image_url = 'https://www.google.com/s2/favicons?domain=mobbin.com&sz=128'
where slug = 'mobbin-10x-seat-12m-169';

-- n8n.
update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/n8n.svg'
where slug = 'n8n-starter-12m-168';

-- Notion.
update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/notion.svg'
where slug = 'notion-business-1-year-non-warranty-179';

-- Peacock (no Simple Icons entry; official Peacock favicon).
update public.products
set image_url = 'https://www.google.com/s2/favicons?domain=peacocktv.com&sz=128'
where slug = 'peacock-official-subscriptions-1year-152';

-- QuillBot (no Simple Icons entry; official QuillBot favicon).
update public.products
set image_url = 'https://www.google.com/s2/favicons?domain=quillbot.com&sz=128'
where slug = 'quillbot-1-month-183';

-- Quizlet.
update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/quizlet.svg'
where slug = 'quizlet-plus-12m-fw-137';

update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/quizlet.svg'
where slug = 'quizlet-plus-ultimate-12m-fw-138';

-- Railway.
update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/railway.svg'
where slug = 'railway-hobby-12m-182';

-- Replit.
update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/replit.svg'
where slug = 'replit-core-12m-121';

-- Shahid VIP (no Simple Icons entry; official Shahid favicon).
update public.products
set image_url = 'https://www.google.com/s2/favicons?domain=shahid.mbc.net&sz=128'
where slug = 'shahid-vip-subscription-features-3-months-111';

-- Spotify.
update public.products
set image_url = 'https://cdn.jsdelivr.net/npm/simple-icons/icons/spotify.svg'
where slug = 'spotify-3m-redeem-link-164';
