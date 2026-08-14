# GH-Store Roadmap

**Product name shown to customers:** GH Store  
**Technical repository name:** `gh-store`  
**Reference repository:** `echocore-store`  
**Archive:** `gh-store-old`  
**Current status:** Stage 6 complete; stages 9, 10, and 11 in progress

## Progress Snapshot

| Stage | Status | Result |
|-------|--------|--------|
| 0. Reset and archive | Complete | Old attempt archived; active repository reset |
| 1. Reference extraction | Complete | Docs, skills, provider contracts, and SQL baseline added |
| 2. Clean foundation | Complete | Next.js, OpenNext, CI, Vitest, and quality gates working |
| 3. Supabase and security | Complete | Identity, catalog, wallet, orders, storage, settings, and reviews applied to hosted staging with RLS and generated types |
| 4. Design system | Complete | Tokens, primitives, glass shell, theme switch, RTL guards |
| 5. Localization and routing | Complete | Arabic RTL, English LTR, route shell, locale-aware document metadata |
| 6. Public storefront | Complete | Configurable homepage, carousel, catalog, search, game and offer detail, static pages, SEO, sitemap, robots |
| 7. Customer account | Pending | Auth UI, profile, wallet, notifications |
| 8. Commerce core | Pending | Cart, checkout, orders, invoices |
| 9. G2Bulk fulfillment | In progress | Sync, top-ups, redeem codes, and reconciliation done; supplier webhook remains |
| 10. Payments | In progress | Manual recharge, Sam invoices, and SyriatelCash done; Binance Pay and admin reconciliation remain |
| 11. Admin operations | In progress | Sign-in, dashboard shell, overview, G2Bulk key, games and voucher imports, catalog editing, website settings, customers, recharges, order operations, access control, activity log, review moderation, and the support queue done; owner-composed notifications, theme settings, per-page SEO, and manual catalog creation remain |
| 12. Release | Pending | QA, staging UAT, Cloudflare domain, production launch |

## Working Rules

**Copy from `echocore-store` first.** It is a working store: its provider calls,
payment flows, edge functions, and admin screens have been used against the real
Sam, G2Bulk, and IGDB APIs, and they handle cases a reading of the API docs does
not reveal. Before building anything that touches a provider, read how echocore
does it and take that behaviour.

Diverge only where this stack requires it — Next.js App Router instead of Vite
and React Router, server components and server actions instead of client fetches,
TypeScript and RLS-first services instead of edge functions for everything — or
where echocore has a defect worth not repeating. When the shape must change, keep
the behaviour and say in a comment what was kept and why.

Never edit `echocore-store`. It is read-only reference.

**Prove provider behaviour, do not infer it.** Where a provider's response is in
question, call the provider and look. A guess about what an API returns, written
into a schema, becomes a silent empty screen.

**Never swallow a provider failure.** A blank balance, an empty history, or a
missing list must say why it is blank. An owner cannot tell "nothing here" from
"the call failed" unless the screen says so, and the two need different actions.

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

**Status: Complete**

- Create and link the hosted GH Store staging project.
- Install Supabase SSR `0.12.4` and Supabase JS `2.112.3`.
- Add server and browser Supabase clients.
- Add Next.js middleware session refresh boundary.
- Generate database types from the linked staging schema.
- Add `profiles`, roles, timestamps, auth trigger, admin helper, and RLS policies.
- Add `requireAuth`, `requireAdmin`, and profile authorization tests.
- Add pgTAP identity/RLS tests.
- Add catalog, media, wallet, transactions, recharge, payment-event, orders,
  order items, idempotency, fulfillment, notifications, invoices, support, and
  audit migrations.
- Add store settings, reviews, and provider sync-log migrations.
- Add protected storage policies.

**Exit criteria met:** Hosted staging migrations apply cleanly, generated types
match the schema, and the presentation-safe settings boundary is covered by a
hosted check. Production project creation belongs to stage 12.

## Stage 4: Design System and Shell

**Status: Complete**

- Define the GH Store customer-facing visual language.
- Build colour, spacing, typography, surface, border, focus, and motion tokens,
  with light as a full peer theme.
- Build the floating header, footer, desktop navigation, and mobile overlay
  navigation.
- Build reusable buttons, cards, bezels, badges, prices, rails, icons, loaders,
  empty states, and error states.
- Add the Arabic typography guard that neutralises letter-spacing and
  text-transform, which break Arabic script.
- Verify responsive desktop/mobile behaviour and reduced-motion support.

**Exit criteria met:** The shell is responsive, localized, and contains no
starter-template UI. The design contract lives in
`docs/design/storefront-design-contract.md`.

## Stage 5: Localization and Routing

**Status: Complete**

- Add Arabic default locale with RTL direction.
- Add English locale with LTR direction.
- Move public routes under the locale route shell.
- Add shared and domain message namespaces.
- Add canonical metadata, alternate language links, sitemap, and robots policy.
- Add compatibility redirects for old route shapes.

**Exit criteria:** Arabic and English render the same current capabilities with correct document direction, locale-aware navigation, and route handling.

## Stage 6: Public Storefront

**Status: Complete**

- Hosted Supabase catalog read service with no mock fallback.
- Configurable homepage driven by `store_settings.home_layout`, with sections
  resolved concurrently and dropped individually when empty or failing.
- Featured hero carousel following the APG pattern, with no rotation under
  reduced motion.
- Games, gift cards, sale offers, and search with a type filter.
- Game detail and offer detail, including the account fields checkout will ask
  for.
- FAQ, how it works, contact, privacy, terms, and links pages.
- Per-page canonical URLs with hreflang alternates, plus sitemap and robots.
- Loading and not-found boundaries scoped so a missing product still answers 404.

**Exit criteria met:** A visitor can browse the complete public catalog without
mock data. Response caching and cache tags are deferred until the catalog has
real volume to measure.

## Stage 7: Customer Account

**Status: Pending**

- Build registration, login, logout, callback, and password recovery.
- Build profile and account settings.
- Build wallet balance and immutable transaction history.
- Build notifications and customer inbox. **Done:** delivery, failure, refund, and
  top-up decisions reach the customer, with an unread count in the header. A
  notification is written by the service client only, so nobody can invent one
  for themselves, and a failed write can never fail the delivery it reports on.
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

**Status: In progress**

### Completed

- Typed G2Bulk provider adapter, catalog sync, pricing mapping, media
  preservation, player validation, dynamic top-up fields, and both the UID
  top-up and redeem-code purchase flows.
- Supplier references and delivered codes persisted the moment they arrive.
- Reconciliation. Checkout waits about ten seconds for the supplier and then
  leaves the order at `fulfilling`; nothing used to go back for it, so an order
  the supplier finished a minute later stayed unfinished until an operator
  noticed. A sweep now re-asks the supplier and settles the outcome.

  The sweep never buys. The purchase path is reached only from checkout and from
  an operator's explicit retry, both of which a person is waiting on; a
  background job that could place an order would be one bug away from buying
  again for every order it looked at. Where there is no supplier order to poll —
  the purchase either never happened or its reply was lost — it settles nothing
  in either direction and marks the attempt `reconcile` for a human, which is
  the state the schema declared from the start and nothing had ever written.

  Completing or failing requires the supplier to have said so. Age alone only
  ever escalates to a person, never settles.

### Remaining

- Accept G2Bulk's own callback so a finished order is known immediately rather
  than at the next sweep. `fulfillment_events` already carries the
  `(provider, external_event_id)` uniqueness a duplicate-safe receiver needs.

**Exit criteria:** Success, pending, delayed, failed, duplicate-callback, and reconciliation scenarios pass in staging.

## Stage 10: Payments and Recharge

**Status: In progress**

### Completed

- Manual ShamCash recharge, reviewed by the owner and never auto-credited.
- Sam API wallet discovery, invoice creation, polling, and reference verification.
- SyriatelCash and ShamCash both through the one Sam provider boundary.
- Tokenized callback with constant-time comparison, re-checked against the stored
  invoice for method, currency, and amount before any money moves. The payload's
  figure is evidence, never an instruction.
- The callback is a Supabase Edge Function, not a route on the store. Supabase is
  public and HTTPS wherever the store is running, so payments are reported during
  development instead of only after a deploy — pointing Sam at the site's own URL
  made a local payment fail silently.
- Credit exactly once per payment, through a `service_role` RPC no customer
  session can call; a replayed callback returns success without a second credit.
- Sam operations panel: the linked wallets, their balances, and their recent
  transfers are read on page load whenever a key is stored, so a saved key proves
  itself immediately. Callback status is shown, and an address Sam cannot reach —
  a local or plain-http one — is called out rather than failing silently.

- Payments reconciliation. Every top-up is shown next to the wallet credit it
  produced, and the disagreements are named rather than collapsed into a status:
  money taken and never credited, a wallet credited with no payment behind it,
  and less arriving than was billed. The default view is what is wrong, because
  "paid but not credited" is a disagreement between two statuses and no status
  filter can ask for it.

### Remaining

- Add Binance Pay only behind explicit configuration.

**Exit criteria met:** Every payment state maps to one auditable wallet result,
and the payments screen is where that mapping is checked. The link is an exact
key — every top-up credits through `credit_recharge_request`, which stamps the
wallet transaction with the request id — rather than a match on amount and time.

## Stage 11: Admin Operations

**Status: In progress**

### Completed

- Admin sign-in and sign-out, with the admin guard in the dashboard layout.
- Dashboard shell with grouped navigation and an overview of real counts.
- Provider settings: G2Bulk API key stored server-side, masked in the UI, with
  key verification and the supplier wallet balance in the header.
- G2Bulk games import and gift-card/voucher import: idempotent,
  presentation-preserving, reconciling withdrawn items, recorded in
  `provider_sync_logs`.
- Catalog editing: game list with search and filters, per-game bilingual fields,
  artwork, carousel flags, publication, and per-package pricing.
- Website settings: homepage section order, titles, and limits; social links;
  contact channels; homepage SEO.
- Customers: search, balances, and audited wallet corrections through the
  `admin_adjust_wallet` RPC rather than direct writes.
- Recharges: the manual review queue, credited-amount entry, and request limits.
  Manual transfers are never auto-credited, because a customer's claim that they
  sent money is not proof that it arrived.
- Orders and fulfilment: list filtered by status — including one "needs
  attention" view for money taken and goods not out — searchable by order number
  or customer, and a detail page showing purchase-time item snapshots, the
  account fields the customer submitted, every delivery attempt with the
  provider's raw request and response, and the wallet movements the order caused.
- Order operations: retry a delivery, and record one completed by hand against a
  required note. Both refuse a completed, refunded, or cancelled order in the
  service as well as in the UI, because the cost of getting it wrong is giving
  stock away.

- Access and accountability. Administrators are promoted and removed, and
  accounts suspended and reactivated, from the customer page instead of a SQL
  statement — both audited. Two changes are refused: your own role or status,
  because the page that would undo it is the one it takes away, and anything
  that would leave no active administrator.
- Activity log. `audit_logs` had been written since the first hand-made order
  change and read by nothing. Every hand-made change now shows with the name of
  whoever made it, alongside the provider sync and reconciliation runs. It shares
  a page with the provider sync runs and the store's own Axiom events, each of
  the three paged rather than truncated at whatever the first screen held.

- Support. `support_threads` and `support_messages` had existed since the orders
  migration with nothing on either side of them. Customers open threads and
  reply; the owner answers from a queue ordered by most recent activity. The
  rules stayed in the database, where they already were: a customer cannot post
  as the store, and cannot resolve their own ticket out of the queue.

- Reviews. Customers can now write one, and only against a delivered order of
  their own — a testimonial strip is worth believing only if the people in it
  bought something. One review per order is enforced by a partial unique index
  rather than a read-then-write. Nothing reaches the storefront until an
  administrator approves it.

### Remaining

- Compose and send a notification to a customer by hand. Delivery, refund, and
  top-up decisions already notify; an owner-written message does not.
- Build theme settings and per-page SEO beyond the homepage.
- Create games and offers by hand, and delete individual offers.

**Exit criteria:** Daily operations can be completed through the dashboard
without direct database edits.

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
