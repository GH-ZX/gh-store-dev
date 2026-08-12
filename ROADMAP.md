# GH-Store Roadmap

**Product name shown to customers:** GH Store  
**Technical repository name:** `gh-store`  
**Reference repository:** `echocore-store`  
**Archive:** `gh-store-old`  
**Current status:** Stage 3 in progress

## Progress Snapshot

| Stage | Status | Result |
|-------|--------|--------|
| 0. Reset and archive | Complete | Old attempt archived; active repository reset |
| 1. Reference extraction | Complete | Docs, skills, provider contracts, and SQL baseline added |
| 2. Clean foundation | Complete | Next.js, OpenNext, CI, Vitest, and quality gates working |
| 3. Supabase and security | In progress | Identity, SSR clients, proxy, generated types, RLS migration, and pgTAP tests working |
| 4. Design system | Pending | New GH Store visual system and shell |
| 5. Localization and routing | Pending | Arabic RTL, English LTR, route shell, metadata |
| 6. Public storefront | Pending | Home, catalog, search, products, offers |
| 7. Customer account | Pending | Auth UI, profile, wallet, notifications |
| 8. Commerce core | Pending | Cart, checkout, orders, invoices |
| 9. G2Bulk fulfillment | Pending | Sync, top-ups, redeem codes, webhooks, reconciliation |
| 10. Payments | Pending | Manual recharge, Sam, SyriatelCash, Binance Pay |
| 11. Admin operations | Pending | Dashboard, support, reviews, settings, audit |
| 12. Release | Pending | QA, staging UAT, Cloudflare domain, production launch |

## Stage 0: Reset and Archive

**Status: Complete**

- Preserve the previous `gh-store` attempt as `gh-store-old`.
- Keep `echocore-store` untouched.
- Delete the previous active implementation from `gh-store`.
- Commit the clean reset while preserving the Git remote.

**Exit criteria:** The active repository contains only the new implementation history and the old attempt is recoverable locally.

## Stage 1: Reference Extraction

**Status: Complete**

- Extract route, feature, integration, and SQL inventories.
- Copy the important G2Bulk, Sam API, and IGDB contracts.
- Add GH-Store-specific orientation and coding skills.
- Keep the legacy SQL as `supabase/reference/gh-store-source-schema.sql` only.
- Exclude mock, destructive, duplicate, and obsolete setup blocks from direct execution.

**Exit criteria:** Every required customer, admin, provider, and database capability has a documented source contract.

## Stage 2: Clean Foundation

**Status: Complete**

- Bootstrap Next.js App Router with TypeScript strict mode.
- Configure Tailwind CSS and the first GH Store foundation screen.
- Configure Cloudflare Workers through OpenNext.
- Configure Wrangler preview and deployment scripts.
- Add Vitest `4.1.10` and the first smoke test.
- Add CI for install, lint, typecheck, tests, and build.
- Pin Node.js 24 and the package manager.

**Verification:** `pnpm test`, `pnpm check`, and OpenNext build pass.

## Stage 3: Supabase and Security

**Status: In progress**

### Completed

- Create and link the hosted GH Store staging project.
- Install Supabase SSR `0.12.4` and Supabase JS `2.112.3`.
- Add server and browser Supabase clients.
- Add Next.js `src/proxy.ts` session refresh boundary.
- Generate database types from the linked staging schema.
- Add `profiles`, roles, timestamps, auth trigger, admin helper, and RLS policies.
- Add `requireAuth`, `requireAdmin`, and profile authorization tests.
- Add pgTAP identity/RLS tests.

### Remaining

- Add catalog and media migrations.
- Add wallet, transactions, recharge, and payment-event migrations.
- Add orders, order items, idempotency, fulfillment, and status-history migrations.
- Add notifications, invoices, reviews, support, audit, and sync-log migrations.
- Add provider settings and protected storage policies.
- Create the new Supabase staging project and apply the migration set.

**Exit criteria:** Hosted staging migrations apply cleanly, generated types match the schema, and anonymous/customer/admin RLS checks pass without using the Supabase Docker stack.

## Stage 4: Design System and Shell

**Status: Pending**

- Define the GH Store customer-facing visual language.
- Build color, spacing, typography, surface, border, focus, and motion tokens.
- Build header, footer, desktop navigation, and mobile navigation.
- Build reusable buttons, cards, inputs, dialogs, tables, loaders, empty states, and error states.
- Verify responsive desktop/mobile behavior and reduced-motion support.

**Exit criteria:** The shell is responsive, accessible, localized-ready, and contains no starter-template UI.

## Stage 5: Localization and Routing

**Status: Pending**

- Add Arabic default locale with RTL direction.
- Add English locale with LTR direction.
- Move public routes under the locale route shell.
- Add shared and domain message namespaces.
- Add canonical metadata, alternate language links, sitemap, and robots policy.
- Add compatibility redirects for old route shapes.

**Exit criteria:** Arabic and English render the same capabilities with correct direction, metadata, and navigation.

## Stage 6: Public Storefront

**Status: Pending**

- Rebuild the homepage and configurable sections.
- Rebuild featured carousel and game cards.
- Rebuild games, gift cards, sale offers, and search.
- Rebuild game detail and offer detail pages.
- Add catalog services, server-side reads, image handling, loading states, and cache tags.
- Add public SEO metadata for catalog pages.

**Exit criteria:** A visitor can browse the complete public catalog without mock data.

## Stage 7: Customer Account

**Status: Pending**

- Build registration, login, logout, callback, and password recovery.
- Build profile and account settings.
- Build wallet balance and immutable transaction history.
- Build notifications and customer inbox.
- Add ban/status handling where required by the reference behavior.

**Exit criteria:** Customers can authenticate and access only their own profile, wallet, orders, and notifications.

## Stage 8: Commerce Core

**Status: Pending**

- Build client cart state as a convenience layer only.
- Validate product, offer, dynamic fields, price, and availability on the server.
- Add atomic wallet debit and order creation RPCs.
- Add checkout idempotency and duplicate-submit protection.
- Build order history, order detail, success, and delivery views.
- Build invoice rendering and lazy PNG/PDF export.

**Exit criteria:** Checkout cannot be manipulated from the browser and cannot double-charge a customer.

## Stage 9: G2Bulk Fulfillment

**Status: Pending**

- Implement typed G2Bulk provider adapter.
- Implement catalog sync, pricing mapping, and media preservation.
- Implement player validation and dynamic top-up fields.
- Implement UID top-up and redeem-code purchase flows.
- Implement polling, webhook handling, retry classification, and reconciliation.
- Persist supplier references and delivery data safely.

**Exit criteria:** Success, pending, delayed, failed, duplicate-callback, and reconciliation scenarios pass in staging.

## Stage 10: Payments and Recharge

**Status: Pending**

- Preserve manual ShamCash QR/pay-code recharge.
- Add Sam API wallet discovery and invoice flow.
- Add SyriatelCash support through the Sam provider boundary.
- Add Binance Pay only behind explicit configuration.
- Validate signed/tokenized callbacks and replay protection.
- Credit the customer wallet exactly once per successful payment.
- Add payment attempts, provider events, and admin reconciliation.

**Exit criteria:** Every payment state maps to one auditable wallet result.

## Stage 11: Admin Operations

**Status: Pending**

- Build dashboard shell and overview.
- Build catalog, pricing, promotions, and media management.
- Build order and fulfillment operations.
- Build recharge and payment operations.
- Build provider settings and sync controls.
- Build customer, review, support, notification, and inbox operations.
- Build homepage, theme, website, and SEO settings.
- Build audit logs, activity logs, and health views.

**Exit criteria:** Daily operations can be completed through the dashboard without direct database edits.

## Stage 12: QA and Release

**Status: Pending**

- Add unit, integration, SQL, provider, and Playwright E2E coverage.
- Test Arabic RTL, English LTR, mobile, desktop, keyboard, and reduced motion.
- Run accessibility, performance, bundle, and Core Web Vitals checks.
- Create separate Supabase production project.
- Apply the approved migration set and seed only approved data.
- Configure Cloudflare production Worker and secrets.
- Purchase domain through GoDaddy and manage DNS through Cloudflare.
- Configure Auth URLs, canonical URLs, payment webhooks, and provider webhooks.
- Run production smoke tests and verify rollback procedures.

**Exit criteria:** Staging UAT is approved, production secrets are separated, rollback is tested, and all critical customer/admin/payment/fulfillment flows pass.

## Commit Policy

Each stage is split into focused commits. Every implementation commit must include:

- Tests for new behavior.
- `pnpm test` where applicable.
- `pnpm check` for TypeScript, routes, or build changes.
- OpenNext build verification for runtime/deployment changes.
- No secrets, generated build output, customer data, or direct edits to `echocore-store`.
