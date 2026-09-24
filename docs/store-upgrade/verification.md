# Verification

Local Postgres-compatible tests used PGlite 0.5.8 installed outside the repository.
Catalog migration exercised a read-only export of 81 products and 679 offers.
Checks covered NW/FW/W5D/W24H, months/years/days, conflicting terms, all-product alias backfill, Arabic discovery, manual overrides, order snapshots and nullable field constraints.
Recharge migration exercised the live credit function against synthetic local wallets: caller authorization, address snapshot, null hash refusal, missing evidence, amount limits, duplicate approvals, duplicate transaction claims and full transaction rollback.
No live purchase or deposit was made. Browser checks use anonymous GETs only.

Known limits: production OAuth/email delivery, signed-in admin workflows and a real exchange deposit require owner acceptance tests. Public BSC RPC availability is an external dependency; failure stops approval without crediting. The transfer hash is public, so manual payer attribution remains required.

## Final release evidence

- `pnpm exec vitest run`: 60 files, 593 tests passed.
- Storefront suite: 72 files, 620 tests passed, including the BEP20, gift-card scope, settings, and admin-operation regressions.
- `pnpm --dir storefront run typecheck`: passed.
- ESLint on changed TypeScript files: errors corrected; final affected-file rerun passed. The root Next lint configuration still emits the existing missing-pages-directory notice for the React Router app.
- `pnpm --dir storefront run build`: passed; existing mixed static/dynamic realtime-alerts import warning remains.
- Anonymous DOM/navigation checks at 390px and 1440px: Arabic and English home/auth/search/product routes return 200; no document overflow or page exceptions. Both homepages show six carousel slides and six quick-buy cards. Changing the offer updates checkout; anonymous checkout preserves the exact destination through login.
- After the user's instruction, no screenshots were captured and no images were inspected. Functional checks above use DOM and navigation only.
- Production `/ar`, `/en`, Arabic search, login, product detail, robots and sitemap: 200; home canonicals are `https://gh-store.me/ar` and `/en`; no page exceptions or horizontal overflow at 390px.
- Current cache-busted deployment smoke: `/en` and `/ar` returned 200 with six quick-buy sections and zero `games-instant-recharge` references; `/en/gift-cards` returned 200 with the scoped gift-card category.
- Eleven migrations `20260924100000` through `20260924200000` are recorded in remote migration history. No historical missing-offer price seeding migration was applied; the BEP20 hardening migrations were applied through isolated reviewed pushes.
- Cloudflare Worker current version `bc4c49ff-7c46-4f7b-855a-14e77d78a35a` deployed to gh-store.me/www and the existing five-minute cron.
- Supabase `binance-webhook` deployed successfully through the Management API; its existing signature verification remains the authorization boundary (`verify_jwt=false`).
- PostHog capture calls were mocked in tests. Production forwarding remains disabled pending project key/region. Consent, privacy boundary and regional endpoint behavior are tested; a real PostHog project acceptance check remains open.

The Supabase CLI dependency changes (`package.json`, `pnpm-lock.yaml`) remain in the working tree; no commit was created.

## Carousel refinement after owner feedback

- Replaced duplicate headings/descriptions with a single logo/wordmark identity and logo-only navigation. Missing/failed logos have a text fallback; full names stay on accessible links/buttons.
- Added unmodified local Gemini/OpenAI SVG assets with source attribution and license. Applied migration `20260924160000_missing_product_brand_logos` after asset deployment; only empty logo fields changed.
- DOM interaction checks at 360, 390 and 1440px in both languages: slide selection works, one active slide, no duplicate heading/description, reduced-motion starts paused. These checks found a 16px English header overflow at 360px; hiding its unused desktop search wrapper and tightening narrow-header spacing fixed it.
- Typecheck, affected-file lint and production build passed after the correction.
- Current deployment retains the prior logo/carousel verification; no screenshots or image inspection were used.
- Production 360px Arabic/English: status 200, six logo nodes, zero fallback names, six quick-buy cards, no overflow or page exceptions; keyboard Enter switches slides and reduced-motion pause remains enabled.
- No screenshots, rendered-image inspection or live payments used.


## Combined release with dashboard SEO — 2026-09-24

- Reviewed OpenCode's BEP20 RPC/trigger changes and category filtering, retained them, and checked the live migration history. Thirteen upgrade migrations are now recorded through `20260924220000`; historical price-seeding migrations remain unapplied.
- Full storefront run: 72 files / 620 tests passed. Subsequent SEO regression tests passed (8 SEO tests total, including two new cases for invalid optional images and shared server/dashboard route lists). Targeted legacy recharge validation: 10 passed.
- Typecheck, production build and affected-file lint passed. Existing realtime-alerts chunk warning and root lint missing-pages notice remain.
- SQL checks: private analytics key isolation, anonymous enabled projection, admin-only settings writes, bounds/activation constraints; recharge USD gate, ownership/evidence, duplicate/idempotent credit and rollback. Hosted wallet contract checks passed. No real payments were made.
- Production DOM checks (images blocked, no screenshots): Arabic/English at 360 and 1440px; six quick-buy cards, ten voucher offers, exactly one gift-card shelf, no empty-category header links, no overflow, changing an offer updates its checkout URL after hydration.
- Production SEO checks: fourteen localized page visits covering Home, About, Products, FAQ, Privacy, Gift Cards and Search. Correct saved titles/descriptions and self canonicals; Home is distinct from About; Search remains noindex.
- Populated bilingual homepage plus fourteen dashboard page SEO entries. Existing nonempty owner edits were preserved. Optional share-image validation is isolated; server route normalization now uses the dashboard allowlist.
- PostHog is fully wired to DB/admin configuration and dashboard status, but remains disabled without a project API key. Missing DB configuration fails closed; no environment fallback enables tracking. No live PostHog delivery is claimed.
- Cloudflare final deployment: `bdb4923f-f047-4480-b76f-ded813c378fb` on gh-store.me/www and the existing cron.
- Unfinished original requests remain listed in request-audit.md; this deployment is not evidence of full artwork completion, owner-approved carousel design, Search Console indexing or real auth/payment acceptance.
