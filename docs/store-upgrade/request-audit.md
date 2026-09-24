# Request audit after owner feedback

This audit follows the owner's explicit messages and the live implementation. The original assistant's numbered twenty-suggestion list is not available in the supplied conversation or saved upgrade notes; do not claim an exact item-by-item reconciliation of those numbers.

The owner rejected the latest homepage/carousel design. Deployed, typechecked and tested does **not** mean the design request is complete. No storefront code or production settings were changed during this audit. No screenshots or image inspection were used.

## Live findings

- 81 active products across the catalog.
- Game vouchers (`games-vouchers`) has **one active product and ten active offers**. The homepage showcase renders product cards, so all ten packages are represented by one PUBG MOBILE UC Vouchers card. Its `from $1.03` is a minimum offer price, not evidence of only one sellable offer.
- The live homepage also has six quick-buy cards, eight game product cards, eight gift-card offer cards and shelves for design, AI, productivity and services. The reported single card is a section problem, not disappearance of the entire catalog.
- Gift cards appears twice: the configured offers section and the automatic product showcase. Deduplication only considers existing product sections, so it misses the overlap with offer sections.
- Header includes `games-instant-recharge`, which has zero active products/offers.
- Nine active products have no active offers. Some appear in homepage shelves (for example CapCut Pro 1 month and Proton VPN Plus 1 month). They need supplier/mapping/availability reconciliation or appropriate merchandising exclusion; never invent prices to populate them.
- 44 active products have no explicit logo URL; two have no large image URL. No product has an explicit thumbnail override. Existing supplier-image fallbacks still serve small cards; zero overrides does not mean all cards are broken.
- Nineteen **active** offers currently require terms review. Earlier notes counted 24 across all offers; these are different scopes.

## Completion against the written requests

| Request | Implemented | Still incomplete |
| --- | --- | --- |
| Homepage that gets shoppers to products quickly | Six quick-buy cards, extra catalog shelves, expanded category header | Owner-approved design; single-item sections; duplicate collections; empty navigation; merchandising only buyable products; balancing mobile page length |
| Carousel using product logos/wordmarks | Logo-based panels/tabs, accessible labels, text fallback; Gemini/ChatGPT/CapCut missing entries filled | Design rejected by owner; broader logo coverage; coherent banners rather than relying on the same generated background and existing provider covers |
| Three artwork roles for the full catalog | Editable logo, large image and thumbnail fields; one generated background; API-image fallback | Full per-product asset pass; 44 missing logo entries and two missing large-image entries; no individually populated thumbnail overrides; no complete collection of product-specific generated hero assets |
| Modern sign-in, sign-up, forgot/reset pages | Shared responsive layout, Google mark, password visibility, recovery paths retained | Owner acceptance and real Google/email/reset delivery checks |
| Readable subscription duration/warranty | Database fields, parser/backfill, customer facts, admin overrides, snapshots and review queue | Resolve nineteen active ambiguous offers; clean supplier shorthand from product titles and descriptions (offer labels have only partial cleanup) |
| Arabic and multilingual discovery, admin tags | 81 products have aliases; Arabic normalization, indexed search, editable aliases | Product-by-product relevance/content review; original customer-facing descriptions and fuller SEO content. Hidden keyword stuffing is not implemented and is not an SEO solution |
| Similar products | Written grouping/mapping guidance, generic product routes | Actual duplicate consolidation and redirects have not been performed; differences in region, entitlement, duration and warranty must be checked first |
| Future APIs | Existing adapter registry, provider mappings and onboarding guidance; independent fulfillment scheduling | A new API still needs its own adapter and contract tests. Automatic multi-supplier selection/failover is not implemented |
| SEO/homepage identity | Home/About canonicals separated, branded metadata, crawl resources and offer structured data | Search Console verification of Google's selected canonical/indexing, recrawl, content work and real search performance; ranking changes are not confirmed |
| Store identity/trust | Existing GH identity applied, some delivery claims corrected, operating guide | Real merchant identity, support hours, consistent final brand/content direction and business-specific policy details |
| USDT hardening | BEP20 chain/recipient/token/confirmation checks, claim evidence, duplicate-credit protection; Binance binding fixes | Still manual payer confirmation/approval; no new automatic per-invoice processor or unique-address flow; real deposit/refund/customer-support acceptance checks |
| Analytics/PostHog | Aggregate counts; optional consent-based PostHog integration | PostHog inactive pending project token/region; no live PostHog acceptance, purchase/revenue funnel attribution or cross-session retention tracking |
| Performance/customer experience | Cached discovery/navigation, responsive asset handling, functional mobile checks, buy-again links | Measured real-user/Core Web Vitals baseline, complete real-customer purchase journey, user feedback and further mobile polish |

## Next work, in order

- [ ] Settle the homepage/carousel direction with the owner before another redesign.
- [x] Fix voucher merchandising: show the ten actual voucher offers for the single-product category. Other single discounted offers may still form a small sale shelf.
- [x] Deduplicate gift-card sections, remove empty navigation destinations and exclude offerless products from purchase-oriented suggestions/shelves.
- [ ] Audit and populate the three artwork roles across the full catalog, keeping useful API assets.
- [ ] Clean customer product naming and resolve active ambiguous terms with supplier evidence.
- [ ] Reconcile the nine products without active offers and review similar-product groups.
- [ ] Complete owner-dependent identity, PostHog, Search Console and payment/auth acceptance work.

## Evidence

Public catalog aggregate SQL and anonymous DOM inspection of `/ar` were used. Image requests were blocked during the homepage DOM audit. Implementation points: `home-discovery.service.ts`, `home-discovery.tsx`, `locale-home.tsx`. Existing local Supabase installation files were preserved.


## Follow-up completed after this audit

Database-driven homepage discovery settings, USDT presentation, strict BEP20 approval, private PostHog settings/dashboard status and bilingual dashboard SEO have been implemented. Two live SEO defects were fixed: optional image validation discarded settings, and an outdated server allowlist dropped three page overrides. Payment/analytics database gates were checked; no real payment was made. PostHog remains disabled until its owner supplies a project key in the dashboard.

Unfinished content/design work remains the full artwork pass, customer naming, ambiguous terms, supplier availability reconciliation, duplicate consolidation and the owner's carousel acceptance. Search Console, merchant facts, real OAuth/email/payment acceptance and live PostHog delivery are also not complete. These are deliberately not represented as finished by this release.
