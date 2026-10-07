# Store Overhaul & Upgrades Release — October 2026

## Overview
All three phases of the store overhaul approved on 2026-10-07 have been implemented, verified, and committed.

---

## 1. Phase Summary & Commits

### Phase 1: UI/UX Minimal Apple-Style Overhaul
- **Commit:** `7e284e6` (`feat(ui): minimal apple-style storefront ui/ux overhaul`)
- **Tokens & Surfaces:** Replaced generic gradients and AI glows with calm neutral palettes:
  - Light mode: Canvas `#f5f5f7`, Surface `#ffffff`, Inset `#f0f0f3`, Text `#1d1d1f`.
  - Dark mode: Canvas `#0b0b0d`, Surface `#161618`, Inset `#111113`, Text `#f5f5f7`.
  - Accent color: Calibrated Apple-style blue fallback (`#0071e3` / `#2997ff`) while retaining admin theme settings.
- **Typography:** Retained Geist for Latin; upgraded Arabic to **IBM Plex Sans Arabic** (weights 400/500/600/700) with adjusted line-height (1.45) and zero letter-spacing for true bold headings.
- **Header:** Clean hairline border, bidirectional mirroring in Arabic, category pills with clear active states, and a focused search bar.
- **Homepage:** Compact hero with category chips, clean logo-tile featured carousel (driven by CSS keyframes without 50ms JS re-renders), available quick-buy rail, admin-ordered shelves, and a concise horizontal trust bar.
- **Cards & Grids:** Unified flat borderless card with 1:1 image tile, 2-line title, category in muted text, and tabular pricing in strong ink. Whole card is interactive with subtle lift on hover and 0.98 active press scale.
- **Checkout:** Clean single-column layout on mobile, eliminating redundant duplicated previews.

### Phase 2: Security & Trust
- **Commit:** `ae1eb7a` (`feat(security): admin mfa, edge rate limits, velocity guards, and transactional email`)
- **Admin MFA TOTP:** Supabase MFA integration with AAL check in `requireAdmin()`. Added `/:locale/dashboard/mfa` for QR code enrollment and challenge verification, plus `admin_mfa_required` setting flag.
- **Edge Rate Limiting:** Configured Cloudflare Workers rate limiter bindings (`RL_AUTH`, `RL_CHECKOUT`, `RL_RECHARGE`) in `wrangler.jsonc` with graceful fallback to local memory limiters.
- **Fraud & Velocity Guards:** `public.check_velocity()` RPC enforcing transaction frequency thresholds per user. Holds suspicious or high-velocity attempts in a new `risk_holds` table with Telegram alerts and an admin review tab in Operations.
- **Transactional Email:** Resend HTTP integration (`email.service.ts`) with bilingual (Arabic/English) templates for order delivery, refunds/cancellations, recharge confirmations, and password resets.
- **Security Headers & Backups:** Enforced Content Security Policy (CSP), client-side error reporter, and a nightly automated backup GitHub Action (`nightly-backup.yml`).

### Phase 3: Commerce & Sales Upgrades
- **Commit:** `a6c7f96` (`feat(commerce): cart, wishlist, flash sales, cashback, reports, and auto-sync`)
- **Cart (Multi-Item Checkout):**
  - Database table `public.cart_items` with owner-only RLS.
  - Atomic RPC `public.place_cart_order()` processing multiple items inside a single database transaction.
  - Shopping cart route `/:locale/cart`, cart counter in header with live badge, and "Add to cart" CTA on product pages.
- **Wishlist & Recently Viewed:**
  - Database table `public.wishlist_items` with owner-only RLS.
  - Heart icon button on product cards and detail pages with optimistic updates.
  - Dedicated wishlist route `/:locale/account/wishlist`.
  - Client-side recently viewed rail on homepage (persisted in `localStorage`).
- **Cashback / Loyalty:**
  - Store setting `cashback_percent`.
  - Database trigger crediting cashback to customer wallets upon order completion (`delivered`).
  - "Earn X% back" badge dynamically rendered on product detail pages.
- **Flash Sales & Promotional Pricing:**
  - Added `offers.sale_price`, `sale_starts_at`, and `sale_ends_at`.
  - Margin safety guard (`resolveOfferSalePrice`) enforcing a minimum 2% profit margin over supplier cost.
  - Sale countdown and discount percentage badges on catalog cards and offer rows.
- **Reports & Data Export:**
  - Admin RPC `public.admin_sales_report()` aggregating revenue, costs, net profit, and margins by day, product, category, or provider.
  - Dedicated admin reports dashboard at `/:locale/dashboard/reports`.
  - One-click CSV export with UTF-8 BOM encoding to ensure Arabic character integrity in Excel.
- **Automated Stock & Price Sync:**
  - Scheduled background sync in Cloudflare Workers cron handler guarded by `auto_sync_enabled` and `auto_sync_max_change_pct`.

---

## 2. Database Migrations To Apply

Apply only the newly created migration files in order (do **not** run `supabase db push --include-all`):

### Security & Velocity (Phase 2)
1. `supabase/migrations/20261011100000_admin_mfa_setting.sql`
2. `supabase/migrations/20261011110000_velocity_guards.sql`
3. `supabase/migrations/20261011120000_email_preferences.sql`

### Commerce Features (Phase 3)
4. `supabase/migrations/20261012100000_cart.sql`
5. `supabase/migrations/20261012110000_wishlist.sql`
6. `supabase/migrations/20261012120000_cashback.sql`
7. `supabase/migrations/20261012130000_offer_sales.sql`
8. `supabase/migrations/20261012140000_reports.sql`
9. `supabase/migrations/20261012150000_auto_sync_settings.sql`

To apply safely with the linked Supabase CLI:
```bash
supabase migration up
```
*(Or execute the SQL files sequentially via the Supabase dashboard SQL editor).*

---

## 3. Owner Actions Required

1. **Transactional Email (Resend):**
   - Create an API key in your Resend account with a verified sending domain.
   - Set the Cloudflare Worker secret:
     ```bash
     wrangler secret put RESEND_API_KEY
     ```
2. **Admin Multi-Factor Authentication (MFA):**
   - Navigate to `/en/dashboard/mfa` (or `/ar/dashboard/mfa`) and scan the QR code using Google Authenticator, 1Password, or Apple Keychain.
   - Once all administrators have enrolled, enable mandatory enforcement by setting `admin_mfa_required = true` in `store_settings`.
3. **Web Analytics (PostHog):**
   - If analytics tracking is desired, paste your PostHog Project Key into Admin Settings (`/dashboard/settings`).
4. **Nightly Database Backup Secret:**
   - Add `SUPABASE_DB_URL` to GitHub repository secrets if you wish to use the `.github/workflows/nightly-backup.yml` action.

---

## 4. Verification & Testing

- **Vitest Suite:** 89 test files passed, 831 tests passed (100% pass rate).
- **TypeScript:** Strict typecheck passed (`tsc -b` returned 0 errors).
- **Production Build:** Both client and server bundles built cleanly with Vite & Rolldown.
