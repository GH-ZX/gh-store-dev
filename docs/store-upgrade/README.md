# Store upgrade — September 2026

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

- [x] Homepage catalog breadth and suggested-product quick buy
- [x] Header categories loaded from catalog, including future categories
- [x] Three editable artwork roles: carousel logo, large image, card thumbnail
- [x] Optional PostHog integration and owner setup instructions (inactive until configured)
- [x] Apply quality/review, artwork and search-index migrations 20260924130000–20260924150000
- [x] Merchant, catalog consolidation, provider onboarding and launch operating guide
- [x] Final typecheck, tests, production build and functional checks without screenshots
- [x] Deploy first storefront release and Binance webhook
- [x] Refine carousel with logo/wordmark identity; verify and deploy
- [x] Commit and push the completed release

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

81 products; 81 with search aliases; zero uncategorized. Seven upgrade migrations applied. Warranties parsed: 6 none, 7 full term, 4 fixed; 24 ambiguous offers require review. Other unknown warranties are not guessed. No supplier prices or product records were deleted.

## Latest homepage refinement

The carousel uses configured logos/wordmarks in the main panel and bottom navigation; duplicate product headings/descriptions are removed. Accessible names remain, and failed/missing logos fall back to text. Gemini/ChatGPT have local SVG marks; a missing CapCut entry reuses the configured logo. Imported card art is bounded over the generated background. The narrow English header overflow is fixed. Latest production version: `947e99d8-7722-456b-ab15-0423d366371f`. Both locales passed 360px production DOM/keyboard checks with six logos and zero fallback names. No screenshots or image inspection.
