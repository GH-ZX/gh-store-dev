# Store upgrade — September 2026

## Current status — reopened after owner feedback

The owner rejected the latest homepage/carousel. The previous checkboxes record implementation and deployment, not completion of every requested outcome. Read [the request audit](request-audit.md) before continuing. This audit found sparse/duplicate shelves, empty category navigation, incomplete catalog artwork, and active products without offers. Code follow-up now scopes gift cards, excludes empty navigation, filters offerless products from homepage suggestions, and hardens BEP20 method handling; migrations `20260924190000`–`20260924200000` are applied and recorded.

- [ ] Homepage/carousel design accepted by the owner
- [x] Resolve single-product voucher shelf (ten offers), duplicate gift-card shelves and empty header category
- [x] Hide products with no active supplier offers from all customer browse/search lists; direct product URLs show an unavailable state
- [x] BatStore zero/missing-stock offers are parked by sync and restored after restock unless an admin edits the offer
- [x] Put available quick-buy products before the logo carousel; confirm Arabic/English layout at 375, 768 and 1280px without screenshots
- [ ] Complete artwork coverage and customer-facing product naming
- [ ] Reconcile nine active products without active offers

## Handoff rules

- User requests no screenshots or image inspection. Use code, DOM, network and automated checks.
- Preserve existing provider mappings, prices and administrator overrides.
- Supabase CLI is authenticated and linked; the connector login is not needed.
- Storefront and Binance webhook are released; see verification.md for deployment evidence.

## Implemented

- [x] Shared mobile-first sign-in, sign-up and password recovery UI, Google icon and password visibility
- [x] Structured duration/warranty parsing, conflict flags, administrator overrides and order snapshots
- [x] Arabic/English search normalization, aliases backfilled for 81 products, editable admin tags
- [x] Cheapest offer default, visible duration/warranty and current-price buy-again links
- [x] Generated GH Store artwork background and reusable product composition
- [x] Image proxy content-type correction and fallback handling
- [x] Fulfillment scheduling independent of notification delivery
- [x] BEP20 transfer evidence, chain verification, payer confirmation and duplicate-credit protection
- [x] Binance payment amount/currency/order binding fixes in interactive, cron and webhook paths
- [x] Anonymous daily store counts and admin health/review queue
- [x] Truthful automatic/manual delivery copy and offer-list structured data
- [x] Database migrations 20260924100000, 20260924110000 and 20260924120000 applied live
- [x] Local SQL checks for catalog parsing, aliases, overrides, snapshots and recharge atomicity

## Release checklist

- [x] Homepage catalog breadth and suggested-product quick buy — ten voucher offers, scoped gift cards, available-product shelves, working offer selection
- [x] Header categories loaded from catalog, including future categories
- [x] Three editable artwork roles: carousel logo, large image, card thumbnail
- [x] Optional PostHog integration and owner setup instructions (inactive until configured)
- [x] Apply quality/review, artwork and search-index migrations 20260924130000–20260924160000
- [x] Apply experience-settings and gift-card scope migrations 20260924170000–20260924180000
- [x] Apply BEP20 method hardening migrations 20260924190000–20260924200000 after review
- [x] Merchant, catalog consolidation, provider onboarding and launch operating guide
- [x] Final typecheck, tests, production build and functional checks without screenshots
- [x] Deploy first storefront release and Binance webhook
- [ ] Refine carousel with logo/wordmark identity — deployed, but design rejected by owner
- [x] Commit and push the completed release

- [x] Release provider availability and customer catalog filters; confirm English and Arabic browse, search and direct out-of-stock pages in production DOM

## Owner-dependent follow-up

- [ ] Confirm real merchant identity, support hours and refund operations
- [ ] Review ambiguous supplier terms in dashboard (do not invent warranties)
- [ ] Connect PostHog project key and region if desired
- [ ] Search Console verification/indexing requests and real customer acceptance tests
- [ ] Any new payment processor account/eligibility/credentials

See [operating guide](operating-guide.md) for similar-product handling, identity/support, USDT approval, future providers and PostHog setup.

## Migration caution

Three historical local migrations dated 20260911 are absent from remote history. Do not blindly run db push: the old missing-offers migration invents prices. Apply only reviewed upgrade migrations atomically and record them in migration history. No purchase, recharge or supplier payment is made during verification.

## Decisions

Months remain calendar months. Warranty is unknown, none, fixed or full term; conflicts require review. Tags improve store search and must not become hidden Google keyword stuffing. Provider imports preserve manual terms and image overrides.

## Final live catalog check

81 products; 81 with search aliases; zero uncategorized. Fifteen upgrade migrations are applied through 20260926100000. Warranties parsed: 6 none, 7 full term, 4 fixed; 24 ambiguous offers require review. Other unknown warranties are not guessed. No supplier prices or product records were deleted.

## Terms review resolution

Migration `20260926090000` adds a third `terms_source`, `unstated`, for an offer whose supplier genuinely publishes no terms. It clears `terms_review_required` while claiming no duration and no warranty, and records `terms_reviewed_at`, `terms_reviewed_by` and a mandatory `terms_review_note`. Previously the only way out of the queue was a manual override, which forced terms the supplier never stated. `enrich_offer_terms` is re-issued so a resolved offer is never re-parsed, and `refresh_product_offer_terms` already swept only automatic offers, so a resolution survives a product rename. The order snapshot is deliberately untouched.

Migration `20260926100000` adds `products.logo_surface_color`, so an admin can recolour the carousel logo tile. An empty value keeps the shared brand surface.

Both were applied on 2026-09-26 by moving `20260911120000`, `20260911121000` and `20260911122000` out of the migrations directory, pushing only the two reviewed files, and restoring them. Those three remain absent from remote history, so the next `supabase db push` will still offer to insert them and must not be run with `--include-all`. Verified after applying: all five new columns queryable, every existing row null, 20 offers carry `terms_review_required` and 19 of them are active. `storefront/app/.server/types/database.ts` was hand-edited for the new columns; regenerate with `supabase gen types` to confirm.

## Latest homepage refinement

The carousel uses configured logos/wordmarks in the main panel and bottom navigation; duplicate product headings/descriptions are removed. Accessible names remain, and failed/missing logos fall back to text. Gemini/ChatGPT have local SVG marks; a missing CapCut entry reuses the configured logo. Imported card art is bounded over the generated background. The narrow English header overflow is fixed. The current home page puts six available quick-buy cards before six logo carousel slides. Production DOM checks in Arabic and English at 375, 768 and 1280px showed no horizontal overflow; all six slides and logos remained present. Latest production version: `a816468f-edeb-4c35-9dd3-fbc66437b039`. The carousel's visual direction is still not marked owner-accepted. No screenshots or image inspection.


## Combined Codex / OpenCode follow-up

- [x] Reviewed and retained OpenCode's catalog scope and BEP20 approval protections
- [x] USDT/BEP20 asset and network marks, progress, amount/address instructions, transfer acknowledgement and transaction link
- [x] Existing recharge instructions survive a disabled method using the saved destination
- [x] Database-admin controls for discovery counts, empty navigation and PostHog; payment settings linked
- [x] PostHog key masked, enabled flag public only, forwarding fails closed if DB configuration is unavailable
- [x] Arabic/English dashboard SEO populated, existing owner edits preserved
- [x] Fixed server/dashboard page SEO allowlist divergence and malformed-image fallback
- [x] Help copy updated for products and mixed automatic/manual fulfillment; optional analytics disclosure added
- [ ] PostHog project API key entered and real event delivery confirmed
- [ ] Full original wishlist complete — remaining artwork, naming/terms, supplier reconciliation, carousel acceptance and owner-dependent checks are still open in request-audit.md

## Provider stock visibility follow-up

All customer product-list queries, including the separate search service, now require at least one active offer. Direct product URLs with no active offer keep their page and show the unavailable state. BatStore import uses its stock count consistently with the provider picker, records stock status, parks zero/unknown inventory, and can reactivate its own parked offers after restock. An administrator saving the offer clears that automatic-restock marker. No supplier import or price update was run against the live catalog. Production deployment `60eae5cd-f283-4d20-9343-46eb4515731b` was checked by fetching English and Arabic product grids, Services pages, Proton VPN search results and its direct product page; all returned HTTP 200 and the expected visibility/copy. No screenshots or image inspection were used.

The current work does not claim every original request is finished. Do not check off those remaining items merely because a release passes tests.
