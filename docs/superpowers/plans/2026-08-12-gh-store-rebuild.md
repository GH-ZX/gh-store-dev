# GH-Store Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Rebuild the `echocore-store` customer experience and store operations inside the clean `gh-store` repository as GH-Store using Next.js, Cloudflare Workers, and a new Supabase backend.

**Architecture:** Use Next.js App Router with Server Components for reads, Server Actions and Route Handlers for validated mutations and webhooks, and a server-only service/use-case layer between the UI and Supabase. Keep provider jobs and scheduled work in Supabase Edge Functions when independent retries and isolated secrets are required.

**Tech Stack:** Next.js 16.3, React 19.2, TypeScript 5.9 strict, Tailwind CSS 4.3, Supabase SSR/Auth/PostgreSQL/RLS, Cloudflare Workers with OpenNext 1.20, Wrangler 4.120, pnpm 11, Zod, Vitest, Playwright, and a typed provider adapter layer.

## Global Constraints

- `echocore-store` is a read-only behavioral and visual reference.
- `gh-store-old` is an archive and must not be used as an implementation dependency.
- `gh-store` remains the active GitHub repository.
- No old users, balances, orders, or financial history are migrated automatically.
- Arabic is the primary locale and must support RTL; English must support LTR.
- Browser code must never call G2Bulk, Sam, Binance Pay, or IGDB directly.
- Provider credentials, service-role keys, and webhook secrets must never enter client bundles or logs.
- Client-submitted prices, totals, roles, balances, and fulfillment states are untrusted.
- Wallet transactions are append-only; financial mutations require database atomicity and idempotency.
- Every new behavior starts with a failing test unless the change is generated configuration.
- Run `pnpm check` after every task that changes TypeScript, routes, or build configuration.
- Verify current library APIs with Context7 before adding or upgrading a framework integration.
- Do not deploy production until staging acceptance tests pass for payments, fulfillment, auth, RTL, mobile, and rollback.

---

## Stage 1: Freeze the Reference Contract

**Deliverable:** A compact parity inventory that describes what must be reproduced, without copying old implementation files.

**Files:**
- Create: `docs/reference/routes.md`
- Create: `docs/reference/features.md`
- Create: `docs/reference/integrations.md`
- Read: `/Users/gh/Coding/echocore-store/PROJECT_MAP.md`
- Read: `/Users/gh/Coding/echocore-store/package.json`
- Read: `/Users/gh/Coding/echocore-store/supabase/config.toml`
- Read: `/Users/gh/Coding/echocore-store/supabase/functions/*/index.ts`

**Steps:**

- [ ] Record every public, protected, admin, legacy, and development route from `PROJECT_MAP.md`.
- [ ] Record every customer capability: catalog, search, cart, checkout, wallet, recharge, orders, invoices, notifications, reviews, support, and bilingual behavior.
- [ ] Record every admin capability: catalog, pricing, promotions, orders, fulfillment, payments, provider settings, theme, homepage layout, reviews, notifications, and audit history.
- [ ] Record provider boundaries for G2Bulk, Sam, ShamCash, SyriatelCash, Binance Pay, and IGDB.
- [ ] Mark each behavior as `required`, `admin-only`, `legacy redirect`, or `dev-only`.
- [ ] Verify that no reference file was modified with `git -C /Users/gh/Coding/echocore-store status --short`.
- [ ] Commit only the inventory files with `git add docs/reference && git commit -m "docs: define store parity contract"`.

**Exit check:** The later stages can name an exact route, capability, and provider behavior without reopening the entire old repository.

## Stage 2: Harden the Clean Foundation

**Deliverable:** A reproducible local and Cloudflare staging foundation with a real quality gate.

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `eslint.config.mjs`
- Modify: `next.config.ts`
- Modify: `wrangler.jsonc`
- Modify: `.env.example`
- Modify: `.dev.vars.example`
- Create: `vitest.config.ts`
- Create: `tests/smoke/foundation.test.ts`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces scripts `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm preview`, and `pnpm check`.
- Produces a `pnpm test` command that exits non-zero on a failing test.
- Produces a CI workflow that runs install, lint, typecheck, tests, and build without secrets in logs.

**Steps:**

- [ ] Add Vitest and configure TypeScript path aliases without changing the Next.js build configuration.
- [ ] Write a smoke test that asserts the foundation configuration exports the expected application name and default locale constants.
- [ ] Run `pnpm test -- tests/smoke/foundation.test.ts` and confirm it fails because the constants do not exist yet.
- [ ] Add the smallest `src/lib/config/app.ts` implementation and make the smoke test pass.
- [ ] Add CI with `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- [ ] Run `pnpm check` and `pnpm exec opennextjs-cloudflare build`.
- [ ] Run `pnpm preview`, request `/`, and confirm HTTP 200 from the local Worker.
- [ ] Commit with `git add package.json pnpm-lock.yaml eslint.config.mjs next.config.ts wrangler.jsonc .env.example .dev.vars.example vitest.config.ts tests .github src/lib/config && git commit -m "chore: harden application foundation"`.

**Exit check:** A clean checkout can install from the lockfile, pass the quality gate, build an OpenNext Worker, and serve the root route locally.

## Stage 3: Build Supabase Staging and Security Boundaries

**Deliverable:** A new staging database with reviewable migrations, generated types, SSR clients, auth session refresh, and tested RLS.

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/00001_identity.sql`
- Create: `supabase/migrations/00002_catalog.sql`
- Create: `supabase/migrations/00003_wallet_orders.sql`
- Create: `supabase/migrations/00004_operations.sql`
- Create: `supabase/seed.sql`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/browser.ts`
- Create: `src/lib/auth/guards.ts`
- Create: `src/lib/validation/auth.ts`
- Create: `src/types/database.ts`
- Create: `supabase/tests/rls/identity.sql`
- Create: `supabase/tests/rls/commerce.sql`
- Modify: `middleware.ts` or the current Next.js proxy entrypoint

**Interfaces:**
- `createSupabaseServerClient(): Promise<SupabaseClient>` reads and writes auth cookies safely.
- `createSupabaseBrowserClient(): SupabaseClient` exposes only the publishable key.
- `requireAuth(): Promise<AuthenticatedUser>` rejects unauthenticated requests.
- `requireAdmin(): Promise<AuthenticatedUser>` rejects authenticated non-admin users.

**Steps:**

- [ ] Create the new staging Supabase project and store its URL and publishable key in local environment files outside Git.
- [ ] Add migrations for profiles, roles, catalog, offers, dynamic fields, wallets, immutable transactions, orders, order items, idempotency records, audit logs, and provider references.
- [ ] Add RLS policies for anonymous catalog reads, customer-owned data, and admin operations.
- [ ] Add security-definer helper functions for admin checks without recursive `profiles` policies.
- [ ] Write RLS tests for anonymous, customer, and admin access before modifying policies.
- [ ] Implement SSR clients and session refresh using the current Supabase SSR guidance.
- [ ] Generate database types from the staging schema.
- [ ] Apply migrations and run the RLS test suite against staging.
- [ ] Commit with `git add supabase src/lib/supabase src/lib/auth src/lib/validation src/types middleware.ts && git commit -m "feat: add staging database and auth boundaries"`.

**Exit check:** Anonymous, customer, and admin requests see only permitted rows, and the app can refresh a Supabase session without exposing service-role credentials.

## Stage 4: Rebuild the Brand and Design System

**Deliverable:** The new GH-Store visual identity applied through reusable tokens and responsive primitives.

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Create: `src/styles/tokens.css`
- Create: `src/lib/brand.ts`
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/card.tsx`
- Create: `src/components/ui/input.tsx`
- Create: `src/components/ui/dialog.tsx`
- Create: `src/components/layout/site-header.tsx`
- Create: `src/components/layout/site-footer.tsx`
- Create: `src/components/layout/mobile-navigation.tsx`
- Create: `src/components/shared/loading-state.tsx`
- Create: `src/components/shared/empty-state.tsx`
- Create: `src/components/shared/error-state.tsx`
- Create: `tests/ui/theme-contract.test.ts`

**Steps:**

- [ ] Translate the reference color and spacing behavior into named GH-Store tokens instead of copying old CSS variables.
- [ ] Define typography, surface, border, accent, focus, motion, and responsive tokens in `tokens.css`.
- [ ] Write a theme contract test that verifies required token names exist and the brand configuration has a name, default locale, and supported locales.
- [ ] Implement the shell primitives with keyboard focus, reduced-motion behavior, and mobile-first sizing.
- [ ] Implement the header, footer, mobile navigation, loading, empty, and error states without product data dependencies.
- [ ] Render the shell on the root route and compare desktop, mobile, RTL, and LTR screenshots against the intended new theme.
- [ ] Run `pnpm check` and commit with `git add src/app src/styles src/lib/brand.ts src/components tests/ui && git commit -m "feat: establish GH-Store design system"`.

**Exit check:** The app has a reusable visual language and shell with no starter-template assets or one-off color systems.

## Stage 5: Establish Locales and Route Shell

**Deliverable:** Stable Arabic and English routing with metadata, direction, navigation, and compatibility redirects.

**Files:**
- Create: `src/app/[locale]/layout.tsx`
- Move or create: `src/app/[locale]/page.tsx`
- Create: `src/i18n/config.ts`
- Create: `src/i18n/request.ts`
- Create: `src/i18n/messages/ar/common.json`
- Create: `src/i18n/messages/en/common.json`
- Create: `src/middleware.ts` or update the current proxy entrypoint
- Create: `src/lib/seo/metadata.ts`
- Create: `tests/i18n/locale-routing.test.ts`

**Interfaces:**
- `Locale = "ar" | "en"`.
- `getLocaleDirection(locale: Locale): "rtl" | "ltr"`.
- `getSiteMetadata(locale: Locale): Metadata`.

**Steps:**

- [ ] Write routing tests for supported locales, Arabic default behavior, and direction mapping.
- [ ] Run the tests and confirm the locale module is missing.
- [ ] Implement locale config, message loading, direction, and metadata helpers.
- [ ] Add route middleware that redirects unsupported locale prefixes and preserves the requested path.
- [ ] Move the root experience under `[locale]` while retaining a root redirect to the Arabic storefront.
- [ ] Add message namespaces for shared navigation and error states in both locales.
- [ ] Add canonical URLs, alternate language links, sitemap generation, and robots policy without hardcoded production domains.
- [ ] Run route tests, `pnpm check`, and commit with `git add src/app src/i18n src/middleware.ts src/lib/seo tests/i18n && git commit -m "feat: add bilingual route shell"`.

**Exit check:** `/` resolves to Arabic, `/en` resolves to English, direction and metadata are correct, and legacy paths have a defined redirect policy.

## Stage 6: Rebuild the Public Storefront

**Deliverable:** Public catalog parity for home, games, gift cards, sale, search, game detail, and offer detail.

**Files:**
- Create: `src/lib/services/catalog.service.ts`
- Create: `src/lib/services/home.service.ts`
- Create: `src/lib/validation/catalog.ts`
- Create: `src/components/store/hero-carousel.tsx`
- Create: `src/components/store/category-navigation.tsx`
- Create: `src/components/store/product-card.tsx`
- Create: `src/components/store/product-grid.tsx`
- Create: `src/components/store/offer-card.tsx`
- Create: `src/components/store/home-section.tsx`
- Create: `src/app/[locale]/store/page.tsx`
- Create: `src/app/[locale]/store/[slug]/page.tsx`
- Create: `src/app/[locale]/games/page.tsx`
- Create: `src/app/[locale]/gift-cards/page.tsx`
- Create: `src/app/[locale]/search/page.tsx`
- Create: `src/app/[locale]/sale/page.tsx`
- Create: `tests/catalog/catalog-service.test.ts`

**Interfaces:**
- `getStoreCatalog(input: CatalogQuery): Promise<StoreCatalog>` reads active catalog data through RLS-safe server access.
- `getProductBySlug(locale: Locale, slug: string): Promise<StoreProduct | null>` returns localized display data.
- `getHomeSections(locale: Locale): Promise<HomeSection[]>` returns enabled homepage sections in display order.

**Steps:**

- [ ] Write catalog service tests for active filtering, locale labels, empty results, and stable ordering.
- [ ] Implement server-side catalog queries and normalized domain types.
- [ ] Implement product cards, grids, category navigation, hero carousel, offer cards, and homepage section shells.
- [ ] Add explicit loading, empty, error, and not-found states for every public catalog route.
- [ ] Add image configuration, responsive image sizes, alt text, and lazy loading for non-hero media.
- [ ] Add public page metadata and revalidation tags for catalog content.
- [ ] Run catalog tests, `pnpm check`, and manual mobile/desktop RTL/LTR checks.
- [ ] Commit with `git add src/lib/services src/lib/validation src/components/store src/app/[locale] tests/catalog && git commit -m "feat: rebuild public storefront"`.

**Exit check:** A visitor can browse the same storefront categories and product journeys as the reference without mock products.

## Stage 7: Add Auth, Profile, Wallet, and Customer Notifications

**Deliverable:** Secure customer identity and wallet views with correct ownership boundaries.

**Files:**
- Create: `src/lib/services/auth.service.ts`
- Create: `src/lib/services/wallet.service.ts`
- Create: `src/lib/services/notification.service.ts`
- Create: `src/lib/validation/profile.ts`
- Create: `src/lib/validation/wallet.ts`
- Create: `src/app/[locale]/auth/login/page.tsx`
- Create: `src/app/[locale]/auth/register/page.tsx`
- Create: `src/app/[locale]/auth/callback/route.ts`
- Create: `src/app/[locale]/auth/reset-password/page.tsx`
- Create: `src/app/[locale]/profile/page.tsx`
- Create: `src/app/[locale]/wallet/page.tsx`
- Create: `src/app/[locale]/notifications/page.tsx`
- Create: `tests/auth/auth-service.test.ts`
- Create: `tests/wallet/wallet-service.test.ts`

**Steps:**

- [ ] Write auth tests for unauthenticated rejection, profile ownership, and admin separation.
- [ ] Write wallet tests for balance reads, immutable transaction ordering, and insufficient-balance rejection.
- [ ] Implement auth service, profile updates, password recovery callback, and protected route guards.
- [ ] Implement wallet reads and notifications through server services with no sensitive data in client state.
- [ ] Add customer-facing safe error messages in Arabic and English.
- [ ] Run tests against staging with a customer account and an admin account.
- [ ] Run `pnpm check` and commit with `git add src/lib/services src/lib/validation src/app/[locale]/auth src/app/[locale]/profile src/app/[locale]/wallet src/app/[locale]/notifications tests && git commit -m "feat: add customer identity and wallet"`.

**Exit check:** Customers can authenticate, view their own wallet and notifications, and cannot read or mutate another user's data.

## Stage 8: Implement Cart, Checkout, Orders, and Invoices

**Deliverable:** A safe customer purchase flow with server-side pricing, idempotency, order states, and receipts.

**Files:**
- Create: `src/lib/services/checkout.service.ts`
- Create: `src/lib/services/order.service.ts`
- Create: `src/lib/services/invoice.service.ts`
- Create: `src/lib/validation/checkout.ts`
- Create: `src/stores/cart-store.ts`
- Create: `src/app/[locale]/cart/page.tsx`
- Create: `src/app/[locale]/checkout/page.tsx`
- Create: `src/app/[locale]/orders/page.tsx`
- Create: `src/app/[locale]/orders/[id]/page.tsx`
- Create: `src/app/[locale]/invoice/[kind]/[id]/page.tsx`
- Create: `src/components/store/cart-item.tsx`
- Create: `src/components/store/checkout-form.tsx`
- Create: `tests/checkout/checkout-service.test.ts`
- Create: `tests/orders/order-state.test.ts`

**Interfaces:**
- `createOrder(input: CreateOrderInput): Promise<CreateOrderResult>` validates the user, recalculates totals, checks idempotency, and calls the atomic database function.
- `getOrderForViewer(orderId: string): Promise<OrderView>` returns only owner/admin-visible data.
- `buildInvoice(input: InvoiceInput): InvoiceDocument` returns customer-safe invoice data.

**Steps:**

- [ ] Write tests for client price tampering, duplicate submissions, insufficient balance, and valid checkout.
- [ ] Write order state transition tests for pending, processing, completed, delayed, failed, refunded, and cancelled states.
- [ ] Implement cart state as client-only convenience data; never treat it as an authority.
- [ ] Implement server-side checkout validation and the atomic order/wallet RPC.
- [ ] Implement order history, order detail, success handling, and customer-safe status messages.
- [ ] Implement invoice rendering and lazy browser export for PNG/PDF without loading export libraries on storefront pages.
- [ ] Run database concurrency and idempotency tests against staging.
- [ ] Run `pnpm check` and commit with `git add src/lib/services src/lib/validation src/stores src/components/store src/app/[locale]/cart src/app/[locale]/checkout src/app/[locale]/orders src/app/[locale]/invoice tests && git commit -m "feat: add safe checkout and order lifecycle"`.

**Exit check:** Repeated checkout requests cannot double-charge, client prices cannot alter totals, and every completed/refunded order has an auditable invoice.

## Stage 9: Integrate G2Bulk Catalog and Fulfillment

**Deliverable:** Reliable provider-isolated catalog sync, UID top-up, redeem-code fulfillment, webhooks, retries, and reconciliation.

**Files:**
- Create: `src/providers/types.ts`
- Create: `src/providers/registry.ts`
- Create: `src/providers/g2bulk/client.ts`
- Create: `src/providers/g2bulk/mapper.ts`
- Create: `src/providers/g2bulk/errors.ts`
- Create: `src/lib/services/sync.service.ts`
- Create: `src/lib/services/fulfillment.service.ts`
- Create: `src/app/api/webhooks/g2bulk/route.ts`
- Create: `supabase/functions/g2bulk-sync/index.ts`
- Create: `supabase/functions/g2bulk-reconcile/index.ts`
- Create: `tests/providers/g2bulk-client.test.ts`
- Create: `tests/fulfillment/fulfillment-state.test.ts`

**Interfaces:**
- `ProviderAdapter` exposes `healthCheck`, `fetchCatalog`, `placeOrder`, `getOrderStatus`, and `parseWebhook`.
- `FulfillmentService.fulfillOrder(orderId: string): Promise<FulfillmentResult>` is idempotent and records every attempt.
- `SyncService.syncProvider(provider: ProviderName): Promise<SyncSummary>` writes normalized catalog data and a sync log.

**Steps:**

- [ ] Write provider fixture tests for successful catalog responses, malformed responses, transient failures, and permanent provider errors.
- [ ] Write fulfillment tests for success, pending, retryable failure, confirmed failure, duplicate webhook, and reconciliation states.
- [ ] Implement typed G2Bulk client with server-only credentials and normalized response mapping.
- [ ] Implement provider registry and database-backed provider references without exposing provider credentials.
- [ ] Implement catalog sync with protected manual overrides, pricing rules, media preservation, and sync logs.
- [ ] Implement fulfillment attempts, provider order references, webhook verification, polling, retry classification, and reconciliation.
- [ ] Run controlled staging fulfillment tests with safe provider credentials.
- [ ] Run `pnpm check` and commit with `git add src/providers src/lib/services src/app/api/webhooks supabase/functions tests/providers tests/fulfillment && git commit -m "feat: add G2Bulk sync and fulfillment"`.

**Exit check:** A provider delay is not treated as a final failure, duplicate callbacks have no duplicate effect, and successful/refunded orders cannot be fulfilled again.

## Stage 10: Add Recharge and Payment Providers

**Deliverable:** Manual recharge, Sam API, ShamCash, SyriatelCash, and configured Binance Pay flows with signed callbacks and reconciliation.

**Files:**
- Create: `src/providers/sam/client.ts`
- Create: `src/providers/sam/errors.ts`
- Create: `src/providers/binance/client.ts`
- Create: `src/providers/binance/signature.ts`
- Create: `src/lib/services/payment.service.ts`
- Create: `src/lib/services/recharge.service.ts`
- Create: `src/lib/validation/payment.ts`
- Create: `src/app/[locale]/wallet/recharge/page.tsx`
- Create: `src/app/api/webhooks/sam/route.ts`
- Create: `src/app/api/webhooks/binance/route.ts`
- Create: `supabase/functions/sam-payment/index.ts`
- Create: `tests/payments/sam-payment.test.ts`
- Create: `tests/payments/binance-signature.test.ts`
- Create: `tests/payments/recharge-reconciliation.test.ts`

**Steps:**

- [ ] Write tests for provider signature validation, expired/replayed callbacks, provider error mapping, and duplicate payment events.
- [ ] Write recharge tests for pending, paid, failed, expired, manually approved, and reconciled states.
- [ ] Implement provider clients and keep API keys in server/Edge secrets only.
- [ ] Implement payment attempts and immutable payment events linked to wallet transactions.
- [ ] Implement manual recharge approval with admin authorization and audit logging.
- [ ] Implement Sam API for ShamCash and SyriatelCash; add Binance Pay behind a provider configuration flag.
- [ ] Run controlled staging payment tests and verify wallet balances match payment events.
- [ ] Run `pnpm check` and commit with `git add src/providers src/lib/services src/lib/validation src/app/[locale]/wallet/recharge src/app/api/webhooks supabase/functions tests/payments && git commit -m "feat: add recharge and payment providers"`.

**Exit check:** Every successful recharge creates exactly one wallet credit, failed or replayed callbacks create no duplicate credit, and admins can reconcile payment attempts.

## Stage 11: Rebuild Admin Operations and Support

**Deliverable:** A complete daily operations surface for catalog, orders, payments, providers, settings, notifications, support, reviews, and audit.

**Files:**
- Create: `src/app/[locale]/dashboard/layout.tsx`
- Create: `src/app/[locale]/dashboard/page.tsx`
- Create: `src/app/[locale]/dashboard/catalog/page.tsx`
- Create: `src/app/[locale]/dashboard/orders/page.tsx`
- Create: `src/app/[locale]/dashboard/payments/page.tsx`
- Create: `src/app/[locale]/dashboard/providers/page.tsx`
- Create: `src/app/[locale]/dashboard/settings/page.tsx`
- Create: `src/app/[locale]/dashboard/support/page.tsx`
- Create: `src/app/[locale]/dashboard/reviews/page.tsx`
- Create: `src/lib/services/admin.service.ts`
- Create: `src/lib/services/support.service.ts`
- Create: `src/lib/services/audit.service.ts`
- Create: `src/components/dashboard/data-table.tsx`
- Create: `src/components/dashboard/stat-card.tsx`
- Create: `src/components/dashboard/filters.tsx`
- Create: `tests/admin/admin-authorization.test.ts`
- Create: `tests/admin/audit-log.test.ts`

**Steps:**

- [ ] Write tests proving every dashboard mutation requires admin authorization and creates an audit event.
- [ ] Implement admin services for catalog, pricing, promotions, order actions, provider tests, settings, reviews, support, and notifications.
- [ ] Implement dashboard layouts with accessible tables, filters, pagination, forms, confirmation dialogs, loading states, and error recovery.
- [ ] Implement customer-safe versus admin-only error presentation.
- [ ] Add homepage section configuration and theme settings without allowing arbitrary unsafe CSS or secrets.
- [ ] Verify admin operations against staging with a non-admin account to confirm denial at middleware, service, and RLS layers.
- [ ] Run `pnpm check` and commit with `git add src/app/[locale]/dashboard src/lib/services src/components/dashboard tests/admin && git commit -m "feat: add admin operations and support"`.

**Exit check:** Normal store operations no longer require direct database edits, and every sensitive admin action is auditable.

## Stage 12: Quality, Production Infrastructure, and Launch

**Deliverable:** A tested staging release and controlled production launch on Cloudflare with a new Supabase production project.

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/customer-journey.spec.ts`
- Create: `tests/e2e/admin-journey.spec.ts`
- Create: `tests/e2e/rtl-ltr.spec.ts`
- Create: `docs/runbooks/payment-failure.md`
- Create: `docs/runbooks/fulfillment-delay.md`
- Create: `docs/runbooks/provider-outage.md`
- Create: `docs/runbooks/rollback.md`
- Create: `.github/workflows/deploy-staging.yml`
- Create: `.github/workflows/deploy-production.yml`
- Modify: `wrangler.jsonc`
- Modify: `.env.example`
- Modify: `README.md`

**Steps:**

- [ ] Write E2E tests for browse, auth, wallet recharge, cart, checkout, order status, invoice access, and admin order review.
- [ ] Write E2E checks for Arabic RTL, English LTR, mobile navigation, keyboard focus, and reduced motion.
- [ ] Run E2E tests against staging and record failures by domain instead of weakening assertions.
- [ ] Run accessibility checks, Lighthouse checks, bundle inspection, and Core Web Vitals checks on public routes.
- [ ] Create production Supabase separately, apply migrations, generate types, configure backups, and load only approved seed data.
- [ ] Configure Cloudflare production secrets, Worker environment, custom domain, HTTPS, DNS, canonical URLs, auth redirects, and provider webhook URLs.
- [ ] Run smoke tests for root, auth callback, catalog, wallet, checkout, payment callback, fulfillment callback, and admin guard.
- [ ] Confirm rollback can restore the previous Worker and that provider jobs can be paused safely.
- [ ] Commit release configuration with `git add playwright.config.ts tests/e2e docs/runbooks .github wrangler.jsonc .env.example README.md && git commit -m "chore: prepare staging and production launch"`.

**Exit check:** Staging acceptance is signed off, production secrets are separated, Cloudflare and Supabase are configured, rollback is documented, and all critical customer and admin flows pass.

---

## Verification Commands

Run these from `/Users/gh/Coding/gh-store` after every implementation stage that changes application code:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec opennextjs-cloudflare build
```

Run the local Cloudflare Worker when a route or runtime behavior changes:

```bash
pnpm preview
```

## Plan Review Checklist

- [x] All twelve stages map to the requested ECHOCORE parity rebuild.
- [x] The old `gh-store` scaffold is not used as an implementation source.
- [x] The active project remains `gh-store` and the old attempt remains `gh-store-old`.
- [x] Supabase staging and production are separate.
- [x] Cloudflare Workers/OpenNext is used instead of static export.
- [x] G2Bulk, Sam, ShamCash, SyriatelCash, Binance Pay, IGDB, invoices, notifications, support, and admin operations are covered.
- [x] Wallet, payment, fulfillment, idempotency, RLS, and webhook safety are covered.
- [x] Each implementation stage has files, interfaces, tests, verification, and a focused commit.
