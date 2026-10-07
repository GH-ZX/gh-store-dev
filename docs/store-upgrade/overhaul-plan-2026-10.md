# Store overhaul plan — October 2026

Owner approved the whole plan on 2026-10-07. Work runs in the order below, and each phase is committed on its own.
Direction: **minimal, Apple-like calm, with marketplace simplicity**. That means one accent, neutral surfaces, real type hierarchy, products first, no glass/glow, and no fabricated data.
Verification uses code, DOM and functional checks only, with no screenshots.

---

## Phase 1 — UI/UX patch (storefront only, no DB changes)

### 1.1 Design tokens: one source of truth
File: `storefront/app/styles/storefront-shell.css` (the `[data-storefront-shell]` block)
- Replace both palettes with a neutral, Apple-like set:
  - Light (default look): canvas `#f5f5f7`, surface `#ffffff`, inset `#f0f0f3`, ink `#1d1d1f`, ink-soft `#424245`, ink-muted `#6e6e73`, ink-faint `#86868b`, line `#e3e3e8`, line-strong `#d2d2d7`.
  - Dark: canvas `#0b0b0d`, surface `#161618`, strong `#1f1f22`, inset `#111113`, ink `#f5f5f7`, soft `#d1d1d6`, muted `#a1a1a6`, faint `#7c7c82`, line `#2a2a2e`.
  - The accent stays owner-configurable through `--sf-*-accent`. The fallback becomes a calm blue: `#0071e3` light, `#2997ff` dark. Price uses ink, not green. Success/warning/danger stay semantic.
- Radius scale: control 10px, inner 12px, card 18px, shell 22px, pill 999px (real pills for chips and badges only).
- Elevation: one soft, hue-tinted shadow pair for hover lift only. Cards are flat by default.
- Spacing scale `--space-1..10` (4, 8, 12, 16, 20, 24, 32, 40, 56, 72) and section rhythm `--section-gap` of 40px on mobile, 64px on desktop.
- Type scale `--text-xs..display` (12, 13, 15, 17, 20, 24, 30, 40, 52) with tabular numbers for prices.

### 1.2 Fonts
File: `storefront/app/root.tsx`
- Keep Geist for Latin.
- Swap Noto Sans Arabic 400/600 for **IBM Plex Sans Arabic 400/500/600/700**, so real bold replaces synthesized bold.
- Remove the dead Tektur/Space Grotesk/Sora variables (`app.css`).
- Arabic headings: `letter-spacing: 0` and line-height 1.45.

### 1.3 Header
Files: `storefront-shell.css`, `components/layout/header-base.tsx`
- Remove `direction:ltr !important` on `.sf-header-main` so the header mirrors correctly in Arabic.
- Translucent-free white/dark bar with a hairline border. The category bar becomes pill chips with a clear active state.
- Search field becomes a calm rounded field. Restore a visible keyboard focus ring.

### 1.4 Homepage
Files: `routes/locale-home.tsx`, new `components/home/home-hero.tsx`, `components/home/home-discovery.tsx`, `components/home/home-sections.tsx`, `styles/storefront-home.css`, `styles/hero-carousel-cinematic.css`
- New order:
  1. Compact hero: headline, sub-line, a search field and category chips.
  2. Featured strip: a simplified carousel with a flat card, the logo on a solid tile, title and "from" price. The fake 4.9 rating, default "Instant" badge, glass, glow and duplicate blurred image are all removed.
  3. Quick buy.
  4. Admin-ordered sections.
  5. Category shelves.
- Carousel progress is driven by CSS animation instead of a 50ms `setInterval` re-render.
- Fix RTL arrow double-flip: use `direction` only and drop `rotate-180`.
- Trust and how-it-works become one compact horizontal "why buy here" strip with no repeated 3-up boxes.
- All inline Arabic/English copy moves to `i18n/messages/{ar,en}/home.json`.
- Delete dead CSS: `.sf-campaign*`, `.sf-featured*` (old logo-tab carousel), duplicate rules and the empty media query.

### 1.5 Product cards and grids
Files: `components/store/product-card.tsx`, `components/store/offer-card.tsx`, `styles/storefront-cards.css`
- One flat card: borderless image tile on an inset surface, fixed 1:1 ratio, title in 2 lines, category in muted text, price as "from X" in strong ink.
- The whole card is the link. The separate "View product →" row is removed. Hover adds a slight lift and image scale; press scales to 0.98.
- Rails use scroll-snap with consistent widths.

### 1.6 Product page
Files: `components/store/product-detail.tsx`, `components/store/product-offer-selection.tsx`, `styles/storefront-product.css`
- Merge the duplicated `.sf-detail-hero` / `.sf-detail-artwork` rules.
- Sticky offset uses a `--header-h` variable instead of the 140/180px magic numbers.
- Offer choices become a clean segmented list with the selected state in accent and duration/warranty badges.
- Support contacts read from public settings (`socialLinks`), falling back to the current values only if no setting exists.

### 1.7 Checkout
Files: `routes/locale-checkout.tsx`, `styles/storefront-commerce.css`
- Single column on mobile: preview once and the summary once.
- The preview block is hidden below `lg` when the summary shows the same product, image and price.
- Sticky pay bar stays.

### 1.8 Cleanup
- Remove the public `/:locale/carousel-test` route, `routes/locale-carousel-test.tsx` and `components/home/hero-carousel.tsx` (only used by the test page).
- Remove the duplicate `@keyframes gh-progress` in `app.css`.

### Phase 1 verification
- `pnpm typecheck` and `pnpm build` in `storefront/`, plus the vitest suite.
- DOM checks at 375/768/1280 in ar and en: no horizontal overflow, carousel slides present, no element containing "4.9".

---

## Phase 2 — Security and trust

### 2.1 Admin 2-factor (Supabase MFA TOTP)
- Code:
  - `.server/lib/auth/guards.ts` `requireAdmin()` also reads `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`.
  - If the admin has a verified factor and the current level is `aal1`, redirect to the new `/:locale/dashboard/mfa` challenge.
  - If no factor is enrolled, show an enrollment banner in the dashboard. Enforcement can be turned on with the `store_settings.admin_mfa_required` flag.
  - New route `dashboard-mfa.tsx` handles enroll (QR from `mfa.enroll`) and verify (`mfa.challengeAndVerify`).
- DB: migration `20261011100000_admin_mfa_setting.sql` adds the boolean setting key `admin_mfa_required` (default false) in the existing settings table. No auth schema changes; Supabase manages factors.

### 2.2 Global rate limiting
- Code:
  - Add the Cloudflare Workers Rate Limiting bindings `RL_AUTH`, `RL_CHECKOUT` and `RL_RECHARGE` in `wrangler.jsonc` (`ratelimits` array).
  - `workers/rate-limiter.ts` uses the binding when present and falls back to the current in-memory limiter. The key is IP plus user id when known.
- DB: none.

### 2.3 Fraud and velocity guards
- DB: migration `20261011110000_velocity_guards.sql`:
  - Function `public.check_velocity(p_user uuid, p_action text)` counts the user's orders, recharges and redeems in the last 10 minutes and 24 hours against settings keys `velocity_*`. It returns allow, or hold with a reason.
  - Table `risk_holds (id, user_id, action, reason, ref_id, created_at, resolved_at, resolved_by)`, RLS admin-only.
- Code: call the function in `place-order.ts`, `recharge-flow.ts` and redeem. On hold, the order stays `pending_review` and an admin Telegram alert is sent. New dashboard "Holds" tab in `dashboard-operations.tsx`.
- Accounts younger than 24h get lower caps.

### 2.4 Transactional email
- Code:
  - New `.server/lib/services/email.service.ts` calls the Resend HTTP API (secret `RESEND_API_KEY`; skipped silently when it is missing).
  - Templates for order delivered, order failed/refunded, recharge approved and password events, in ar and en.
  - Hooked into the existing notification dispatch next to Telegram.
- DB: migration `20261011120000_email_preferences.sql` adds `profiles.email_notifications boolean default true` and an `email_log` table (id, user_id, kind, ref_id, status, created_at) for idempotency.

### 2.5 CSP enforcement
- Move from report-only to enforced, keeping the currently reported sources. Keep `unsafe-inline` only for styles; scripts use a nonce for the theme bootstrap script.

### 2.6 Backups and monitoring
- Add `docs/operations/backups.md` describing Supabase PITR/daily backups.
- Add a GitHub Action `nightly-backup.yml` that runs `supabase db dump` to an artifact (needs the `SUPABASE_DB_URL` secret).
- Client error capture posts `window.onerror` / `unhandledrejection` to the existing `/api/csp-report`-style endpoint, which becomes `/api/client-error`, and on to Axiom.

---

## Phase 3 — Sales features

### 3.1 Cart (multi-item checkout)
- DB: migration `20261012100000_cart.sql`:
  - `cart_items (user_id, offer_id, quantity, input_values jsonb, created_at)` with RLS owner-only.
  - RPC `place_cart_order(p_items jsonb, p_idempotency_key text)` creates one order per item inside a single wallet-debit transaction. It reuses the existing order-creation path; total and prices are recalculated server-side.
- Code: `cart.service.ts`, `/:locale/cart` route, "Add to cart" next to Buy on the offer selection, a header cart counter, and cart checkout.

### 3.2 Wishlist and recently viewed
- DB: `20261012110000_wishlist.sql` adds `wishlist_items (user_id, product_id, created_at)` with RLS owner-only.
- Code: heart button on the card and product page, plus an `/account/wishlist` page. Recently viewed stays client-side (localStorage, last 12) and shows as a home rail.

### 3.3 Cashback / loyalty
- DB: `20261012120000_cashback.sql` adds the settings key `cashback_percent` (default 0 = off). A trigger on order → `delivered` credits the wallet with an append-only `wallet_transactions` row of type `cashback` and an idempotent unique index on (order_id, type).
- Code: admin setting field and "Earn X% back" on the product page when enabled.

### 3.4 Flash sales
- DB: `20261012130000_offer_sales.sql` adds `offers.sale_price numeric`, `sale_starts_at` and `sale_ends_at`. The server price resolver uses the sale price while active, never below cost plus the 2% guard.
- Code: countdown badge on cards and product page, plus admin fields in the offer editor.

### 3.5 Reports and CSV export
- DB: `20261012140000_reports.sql` adds the RPC `admin_sales_report(p_from date, p_to date, p_group text)` returning revenue, cost, profit and orders grouped by day, product, category or provider (admin only).
- Code: `/dashboard/reports` with a date range, grouping table and CSV export, plus a CSV export on the orders and customers lists.

### 3.6 Automated stock/price sync
- Code: extend the existing 5-minute cron (`workers/app.ts` scheduled) to run the provider stock sync every 6h, guarded by a settings flag `auto_sync_enabled`. Prices only update within ±X% and larger changes go to the review queue.
- DB: settings keys `auto_sync_enabled` and `auto_sync_max_change_pct`.

### 3.7 Analytics
- PostHog only needs the owner's project key (dashboard → settings). No code change.

---

## Owner actions needed (cannot be done in code)
- Resend account plus a verified sending domain, then set the `RESEND_API_KEY` worker secret.
- PostHog project key.
- Confirm the Supabase plan includes PITR, or add the `SUPABASE_DB_URL` GitHub secret for nightly dumps.
- Enroll an authenticator app on each admin account, then switch `admin_mfa_required` on.

## Migration rule
Apply only the reviewed new files. Do **not** run `supabase db push --include-all` (see README "Migration caution").
