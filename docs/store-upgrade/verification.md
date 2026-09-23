# Verification

Local Postgres-compatible tests used PGlite 0.5.8 installed outside the repository.
Catalog migration exercised a read-only export of 81 products and 679 offers.
Checks covered NW/FW/W5D/W24H, months/years/days, conflicting terms, all-product alias backfill, Arabic discovery, manual overrides, order snapshots and nullable field constraints.
Recharge migration exercised the live credit function against synthetic local wallets: caller authorization, address snapshot, null hash refusal, missing evidence, amount limits, duplicate approvals, duplicate transaction claims and full transaction rollback.
No live purchase or deposit was made. Browser checks use anonymous GETs only.

Known limits: production OAuth/email delivery, signed-in admin workflows and a real exchange deposit require owner acceptance tests. Public BSC RPC availability is an external dependency; failure stops approval without crediting. The transfer hash is public, so manual payer attribution remains required.

## Final release evidence

- `pnpm exec vitest run`: 60 files, 593 tests passed.
- Storefront suite: 69 files, 601 tests passed; subsequent targeted Binance settlement binding suite: 8 additional tests passed (interactive and cron wrong order/currency/missing transaction refusal, matching evidence credit).
- `pnpm --dir storefront run typecheck`: passed.
- ESLint on changed TypeScript files: errors corrected; final affected-file rerun passed. The root Next lint configuration still emits the existing missing-pages-directory notice for the React Router app.
- `pnpm --dir storefront run build`: passed; existing mixed static/dynamic realtime-alerts import warning remains.
- Anonymous DOM/navigation checks at 390px and 1440px: Arabic and English home/auth/search/product routes return 200; no document overflow or page exceptions. Both homepages show six carousel slides and six quick-buy cards. Changing the offer updates checkout; anonymous checkout preserves the exact destination through login.
- After the user's instruction, no screenshots were captured and no images were inspected. Functional checks above use DOM and navigation only.
- Production `/ar`, `/en`, Arabic search, login, product detail, robots and sitemap: 200; home canonicals are `https://gh-store.me/ar` and `/en`; no page exceptions or horizontal overflow at 390px.
- Six migrations `20260924100000` through `20260924150000` applied through authenticated CLI transactions with migration-history records. No historical missing-offer price seeding migration was applied.
- Cloudflare Worker deployed version `9ac69064-73c3-4fcb-90a9-45d1d0e2adf3` to gh-store.me/www and the existing five-minute cron.
- Supabase `binance-webhook` deployed successfully through the Management API; its existing signature verification remains the authorization boundary (`verify_jwt=false`).
- PostHog capture calls were mocked in tests. Production forwarding remains disabled pending project key/region. Consent, privacy boundary and regional endpoint behavior are tested; a real PostHog project acceptance check remains open.

The user's local Supabase CLI installation changes (`package.json`, `pnpm-lock.yaml`, `package-lock.json`) are preserved outside this release commit.

## Carousel refinement after owner feedback

- Replaced duplicate headings/descriptions with a single logo/wordmark identity and logo-only navigation. Missing/failed logos have a text fallback; full names stay on accessible links/buttons.
- Added unmodified local Gemini/OpenAI SVG assets with source attribution and license. Applied migration `20260924160000_missing_product_brand_logos` after asset deployment; only empty logo fields changed.
- DOM interaction checks at 360, 390 and 1440px in both languages: slide selection works, one active slide, no duplicate heading/description, reduced-motion starts paused. These checks found a 16px English header overflow at 360px; hiding its unused desktop search wrapper and tightening narrow-header spacing fixed it.
- Typecheck, affected-file lint and production build passed after the correction.
- Deployed Cloudflare version `947e99d8-7722-456b-ab15-0423d366371f`.
- Production 360px Arabic/English: status 200, six logo nodes, zero fallback names, six quick-buy cards, no overflow or page exceptions; keyboard Enter switches slides and reduced-motion pause remains enabled.
- No screenshots, rendered-image inspection or live payments used.
