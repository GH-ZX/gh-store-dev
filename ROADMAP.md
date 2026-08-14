# GH-Store Roadmap

**Product name shown to customers:** GH Store  
**Technical repository name:** `gh-store`  
**Reference repository:** `echocore-store`  
**Archive:** `gh-store-old`  
**Current status:** Stages 0–11 complete; stage 12 started — CI now runs the
test suite, and the remaining release work is E2E coverage, accessibility and
performance passes, the production Supabase project, and the domain

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
| 7. Customer account | Complete | Auth, recovery, profile, wallet history, notifications, suspension handling |
| 8. Commerce core | Complete | Server-validated checkout, atomic debit, idempotency, order views, and invoices; no cart, by decision |
| 9. G2Bulk fulfillment | Complete | Sync, top-ups, redeem codes, reconciliation, and the supplier callback done |
| 10. Payments | Complete | Manual recharge, Sam invoices, SyriatelCash, ShamCash, payments reconciliation, and Binance Pay |
| 11. Admin operations | Complete | Every daily operation runs from the dashboard: catalog import and hand-built catalog, pricing, orders and fulfilment, recharges, payments, customers, access, support, reviews, notifications, activity log, website content, theme, and SEO |
| 12. Release | In progress | CI runs the tests and a browser suite covers the anonymous storefront on phone and desktop in both languages; signed-in E2E, accessibility, the production project, the domain, and UAT remain |

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

Three later corrections, all things a person notices before a test does:

- Marks for the channels a customer can reach the store through — WhatsApp,
  Telegram, Instagram, TikTok, YouTube, X, Discord, Facebook, and the plain mail,
  phone and link glyphs. They break the house line style on purpose: a brand is
  recognised as a silhouette, so redrawing one as a 1.5-weight outline produces a
  glyph nobody recognises. Single-colour, so eight brand palettes do not shout
  over the store, and the dashboard shows the mark beside each row so a link set
  to the wrong platform is visible before it ships.
- One magnifier in the search field, not two. There was a decorative one at the
  head of the input and a second on the submit button; the button's is the one
  that labels something a press does.
- Artwork now paints its placeholder tint while it loads, not only when it is
  missing. Supplier hosts are slow — one measured eleven seconds for a 178 KB
  thumbnail — and until the bytes arrived a grid of empty boxes read as a page
  that had failed rather than one still arriving.

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
- Add compatibility redirects for old route shapes. An unprefixed path is sent to
  the Arabic one by the middleware, and the reference contract's singular
  `/game/:slug` and `/game/:gameSlug/:offerSlug` are permanent redirects to the
  plural routes this store uses. The rest of the old shapes are deliberately
  absent: `/cart` has no destination because there is no cart, and `/success`,
  `/invoice/:kind/:id` and `/dashboard/operations` describe pages that were
  rebuilt under different addresses on a domain that has never served the old
  ones. A redirect nobody can arrive at is a claim, not a compatibility measure.

**Exit criteria:** Arabic and English render the same current capabilities with correct document direction, locale-aware navigation, and route handling.

## Stage 6: Public Storefront

**Status: Complete**

- Hosted Supabase catalog read service with no mock fallback.
- Configurable homepage driven by `store_settings.home_layout`, with sections
  resolved concurrently and dropped individually when empty or failing.
- Featured hero carousel following the APG pattern, with no rotation under
  reduced motion. Rebuilt on Embla v8 once the hand-rolled drag, timer and pause
  rules had become reimplementations of a solved problem; `direction` is passed
  to the library rather than left to CSS, because an RTL document driving an LTR
  carousel drags backwards. Rotation, interval, looping, and slide alignment are
  set from the dashboard.
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

**Status: Complete**

This stage had been left marked pending long after its work landed, so each item
was walked against the code before the status moved.

- Registration, sign-in, sign-out, and password recovery. Sign-up and sign-in
  share one form at `/login`, switched by `?mode=sign-up`. There is deliberately
  no `/auth/callback` route: Supabase delivers recovery as a URL *fragment*,
  which a server route cannot read, so the reset panel is client-side and
  establishes the session in the browser.
- Profile and account settings, including a password change.
- Wallet balance and an immutable transaction history, paged.
- Notifications and customer inbox: delivery, failure, refund, and top-up
  decisions reach the customer, with an unread count in the header. A
  notification is written by the service client only, so nobody can invent one
  for themselves, and a failed write can never fail the delivery it reports on.
- Status handling. A suspended account is refused at checkout by the RPC itself
  rather than by the page, and `is_active` gates administrator access.

**Exit criteria met:** every one of these reads through the caller's own session,
so RLS decides what a customer can see; the policies are covered by
`supabase/tests/rls/identity.sql` against hosted staging.

## Stage 8: Commerce Core

**Status: Complete**

### Completed

- Server-side validation of product, offer, dynamic fields, price, and
  availability. The price is re-read inside the transaction, so a figure edited
  in the browser is never what gets charged.
- Atomic wallet debit and order creation in one RPC (`place_wallet_order`):
  it locks the wallet, debits, and writes the order together, so there is no
  window in which a customer is charged without an order or holds one they did
  not pay for.
- Checkout idempotency and duplicate-submit protection. The key is claimed
  before any money moves; a repeat with the same key returns the stored response
  instead of buying again, and a repeat that arrives while the first is still
  running is refused rather than allowed to start a second order.
- Order history, order detail, success, and delivery views, including the
  account fields submitted and the codes delivered.

- Invoices. An order that was paid for has a document, snapshotted at issue so
  it keeps saying what was bought and what it cost even after the catalog moves.
  Saved with the browser's own print-to-PDF rather than a rasteriser shipped to
  every visitor.

**Decided: no cart.** Checkout is one offer at a time, which is how every flow
here is built and how top-ups are actually bought — and the supplier cannot buy
many products in one call anyway, so a basket would be several orders wearing
one button. Recorded as a decision rather than left on the list, so nobody
builds one because a list said so.

**Exit criteria met:** checkout cannot be manipulated from the browser and
cannot double-charge.

## Stage 9: G2Bulk Fulfillment

**Status: Complete**

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

- The supplier callback. Every top-up order now carries an address G2Bulk
  reports its outcome to, so a delivery that finishes after checkout gave up is
  settled at once rather than at the next sweep. It is an edge function beside
  the payment callback, for the same reason: the supplier calls from its own
  network, and the store has no public address until it is deployed.

  The payload is a claim, not an instruction. A `FAILED` for an order already
  completed, or a `COMPLETED` for one already refunded, settles nothing and is
  recorded where an operator will see it — reversing either automatically is
  worse than a wait. Repeats are absorbed by `(provider, external_event_id)`,
  and an event claimed but not processed is retried rather than discarded.

  The sweep remains the backstop for everything that never arrives.

**Exit criteria met, with one caveat:** delivered, failed, duplicate, unknown
supplier order, and both contradictions were exercised against hosted staging.
Those runs used synthetic supplier orders — a live G2Bulk purchase reporting
back through the callback belongs to stage 12's UAT.

The callback is inert until an owner generates its secret on the Providers page.
Until then no `callback_url` is sent and orders settle through the sweep, which
is exactly how they settled before.

## Stage 10: Payments and Recharge

**Status: Complete**

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

- Binance Pay, behind explicit configuration. Credentials and the switch that
  offers it to customers are separate: saving a key must not put a new payment
  method in front of anybody by itself. The callback is never trusted — its body
  shape is the one part of that API the published documentation would not give
  up — so a notification only causes the store to ask Binance about the order,
  and that answer decides. Crediting refuses a short payment, credits once, and
  reports a replay as idempotent; all four rules were exercised against hosted
  staging inside a transaction that was rolled back.

**Exit criteria met:** Every payment state maps to one auditable wallet result,
and the payments screen is where that mapping is checked. The link is an exact
key — every top-up credits through `credit_recharge_request`, which stamps the
wallet transaction with the request id — rather than a match on amount and time.

## Stage 11: Admin Operations

**Status: Complete**

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
- Website settings: the whole homepage. Sections are added, removed, reordered,
  switched on, titled and subtitled in both languages, given an item count, and
  for the three handpicked types pointed at the games, packages or reviews they
  show. The submitted list is the layout, so adding and removing need no action
  of their own and a rearrangement still saves in one step.
- Editing the homepage from the homepage. An administrator gets a toggle on the
  storefront that puts a pencil beside every section heading and over every game
  tile and carousel slide, each opening a sheet that saves and revalidates in
  place. It is the same authority as the dashboard — every action re-checks the
  administrator — and a signed-out visitor receives none of it.
- Social links; contact channels; homepage SEO.
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

- Owner-written messages. The automatic notifications had covered deliveries,
  refunds and top-up decisions since stage 7, but a message with a person behind
  it had nowhere to be written. One subject and one body, from the customer's own
  page, stored in both languages as typed — the alternative was asking for every
  message twice, or showing half the customers an empty one. Audited with its
  text, because a message signed by the store may need attributing later.

- Theme. `store_settings.theme` had been declared and unused since the settings
  migration. Two accents and a default mode, with the supporting shades derived
  rather than asked for, and a contrast reading that warns when button labels on
  the chosen accent would fall below AA. Only plain hex is accepted, because
  these values are written into a `<style>` element.

  Then two additions, both taken from the reference store and made lighter.
  Ready-made accent pairs, so an owner who wants a purple store does not have to
  work out which purple carries white text — a preset fills the two fields the
  editor already had, and a test refuses any whose accent misses 4.5:1. And a
  page backdrop: `aurora`, `mesh` or `grid`, one fixed CSS layer with no
  animation and no second element, against three blurred blobs drifting on
  90-second loops for as long as the tab is open. Both are drawn from existing
  tokens, so they follow the owner's accents and both themes for free, and the
  backdrop is kept off the dashboard, which is a working surface.

- Per-page SEO. Ten pages beyond the homepage — the catalog lists, search, and
  the static content — each with its own title and description, falling back
  field by field to the page's own wording. Detail pages are deliberately absent:
  their metadata comes from the product they show.

- Manual catalog. A game and its packages can be created without a supplier
  import, and a single package removed. Both are created unpublished; a package
  with no provider mapping cannot be delivered automatically, so it goes on sale
  only when its owner has said they will fulfil it by hand.

**Exit criteria met:** every daily operation — pricing, orders, refunds,
recharges, customers, support, reviews, catalog, and the store's own appearance —
is reachable from the dashboard without a SQL statement.

## Stage 12: QA and Release

**Status: In progress**

### Done

- CI runs `pnpm test`. It did not, until now: the pipeline ran lint, typecheck,
  build, and the OpenNext build, and never the suite — so four hundred
  assertions, including every rule about refunds, idempotency and provider
  failure classification, gated nothing.

- Browser coverage of the anonymous storefront, at `pnpm test:e2e`. Every case
  runs twice, once on a phone and once on a desktop, and the language-dependent
  ones run in both: document direction, the locale redirect and the old singular
  game URL, a carousel drag advancing in reading order without navigating, a
  logo marker jumping to its game and the artwork opening it, the mobile drawer
  opening and the closed one letting header taps through, a game page answering
  and a missing one answering 404, and no rotation under reduced motion.

  Playwright drives the Chrome already on the machine rather than downloading
  its own, so the suite costs nothing to start.

  It found two things on its first full run. The carousel arrows had never
  rendered: they were gated on Embla's snap list, which was seeded from a
  `reInit` event the library emits only when it is *re*-activated — a first load
  emits `init`, so the value stayed empty and the controls never appeared. And
  `127.0.0.1` was refused its own dev chunks, the same cross-origin block that
  made the site look complete and dead on a phone, because the allow-list was
  built from network interfaces and loopback is not one.

  Not in CI. These need a store with a catalog behind them, and CI has no
  Supabase project; wiring them to one would make the pipeline fail for reasons
  that have nothing to do with the commit.

- A breadth pass over every public page, in `tests/e2e/pages.spec.ts`: each one
  answers 200, shows a first-level heading, throws nothing while hydrating, and
  does not scroll sideways — plus the account pages sending a signed-out visitor
  to sign in. Console output is not asserted, because supplier image hosts fail
  in ways this store does not control; an uncaught exception is always ours.

  It found that the homepage had no `h1` at all. Every other page had one, and
  the page a visitor and a crawler meet first opened its outline at level 2. It
  now carries the owner's own SEO title, visually hidden — the carousel cannot
  supply the heading, because each slide is a different game and a heading built
  from one would rename the store every few seconds.

### Done

- Signed-in and administrator browser suite, in `tests/e2e/admin.setup.ts` and
  `tests/e2e/admin.spec.ts`. The setup drives the real `/ar/login` form with an
  account the owner supplies through `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`
  (in `.env.local`, never committed) and saves the session; the spec then
  covers the wrong-password error, the redirect to the account page, the guard
  sending a signed-out visitor away from `/dashboard` with its return path,
  the overview, the theme editor's controls, every dashboard page answering and
  fitting, and signing out. The two admin projects exist only when those
  variables are set, so a machine or CI without an account runs the anonymous
  suite untouched.

  It found one real defect: the theme presets lived in a `<label>`, and a
  label's text bleeds into the first control inside it, so the first preset
  button announced a wall of text ("أزواج جاهزة نيلي زمردي…") instead of its
  name. They are now a `fieldset` with a `legend`, which is what a group of
  toggle buttons is.

### Remaining

- Add integration, SQL, and provider coverage on top of the unit suite.
- Test keyboard navigation.
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
