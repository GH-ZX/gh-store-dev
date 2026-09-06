# GH Store storefront redesign

Reference: https://hesap.com.tr, inspected in the in-app browser in light and dark modes on 2026-09-06. Direction: search-led commerce, clear category navigation, compact readable offers, artwork separated from product text. Existing admin interface stays unchanged.

## Visual references

- Desktop homepage: `/Users/mbalkhi/.codex/generated_images/01a07750-def5-7d71-820d-2a6f02a04b83/exec-f1c4abb2-57ea-4939-ada8-8396fa9c3a3e.png`
- Dark product: `/Users/mbalkhi/.codex/generated_images/01a07750-def5-7d71-820d-2a6f02a04b83/exec-f4fa74d1-93cf-40ce-bd14-57b21193a89e.png`
- Mobile home/checkout: `/Users/mbalkhi/.codex/generated_images/01a07750-def5-7d71-820d-2a6f02a04b83/exec-d17e58d7-85d4-4899-9680-5300fd853fa3.png`

These concepts establish geometry and appearance. Actual catalog content, availability, prices, configured sections, and account data always take precedence over illustrative mockup data. Do not reproduce invented prices, offers, ratings, metrics, payment states, region claims, or provider claims from concepts.

## System

- Customer routes only, wrapper `[data-storefront-shell]`; dashboard gets original chrome and original tokens. Portal surfaces must carry the same customer scope.
- Light: canvas #f5f6f8, white surface, inset #f0f2f6, ink #171a24, secondary #697080, border #e5e7ed, accent #5354ee, price #177641.
- Dark: canvas #101218, surface #191c25, inset #14171f, ink #f3f4fa, secondary #a0a7b8, border #2a2e3a, accent #7576ff (button #5354ee), price #74d69a.
- Indigo default action; respect explicitly configured safe accent overrides when present. New customer defaults replace old decorative surfaces; no backdrop, glows or translucent pills. Theme switch persistence remains.
- 1280px max content width; desktop gutters32, mobile16. Header full-width white/charcoal, 76px main row + 48px category navigation. Mobile two rows logo/utilities and search, category rail scrolls.
- Inter/available clean Latin font plus current Arabic font. Normal UI 14-16px, body16/1.6, page titles30-34 desktop24 mobile, section24, hero40-48 desktop28 mobile.
- 12px cards, 8px controls, 44px minimum controls, quiet borders, very slight shadow only when helpful. 16-24px grid gaps; sections40-48px apart. No repeated giant empty headers.
- Logical RTL layout, semantic DOM ordering, isolate prices/IDs with bdi. Visible keyboard focus, proper labels/dialogs, reduced-motion support. No global restyle of shared admin primitives.

## Surfaces

Header: GH STORE wordmark, prominent real search with suggestions, locale and theme controls, wallet/account/sign-in. Below, All products / Games / Gift cards / AI & subscriptions / Offers. Use existing valid URLs/data; no marketplace/cart invented. Keep accessible mobile menu, signout, account destinations, language path/query preservation.

Home: main navy campaign with original controller image and HTML copy 'Your digital world. One place.' / Arabic 'عالمك الرقمي. في مكان واحد.'; support 'Top-ups, gift cards and subscriptions, ready when you are.' / 'شحن، بطاقات هدايا واشتراكات تناسب عالمك.'; CTA Explore products / استكشف المنتجات. Two smaller AI and gift-card art promos. Configured featured carousel remains available as a compact product discovery section; preserve configured product order and edit controls. Configured lower sections keep their content/order. Product covers use 4:3 or square art with title/price BELOW, no dark fade over titles. Offer rails compact with artwork, product/title, clear actual price. No fake discounts.

Catalog/search: small heading/breadcrumb, counts from real data, clear filter toolbar/sidebar with normal select/search controls, responsive product/offer grid and useful empty state. Product page has compact image+title summary and clear offers selection/cards; offer detail has readable information and purchase summary with existing checkout link. Do not bypass field entry or final payment review. Preserve all deep links and category routes.

Checkout/accounts: calm panels, persistent labels, compact product summary, clear totals, normal account navigation, readable statuses/history. Desktop checkout form plus summary; mobile orderly stack and existing sticky pay bar. Keep checkout field names, idempotency, errors, polling, invoice white print surface and all server logic. No live purchases, wallet changes, messages or provider mutations.

Content/footer: restrained typography, clear Help/Store/Legal links, no invented trust claims. Existing settings copy/social links stay functional. All prices/provider data remain live and all financial tests mocked.

## Asset generation

Built-in Image Gen produced three original text-free campaign assets: controller on navy negative space; violet crystal on pale lavender; floating gift cards on pale blue. Final optimized assets live under `storefront/public/storefront/`. No product metadata or remote database writes needed.

## Final review and verification

Compared rendered desktop/mobile screenshots with the generated homepage, dark product, and mobile concepts using image inspection. The search-first header, restrained navigation, three campaign composition, separate product titles/prices, offer selection with adjacent summary, and mobile stacking are implemented. Arabic mirrors the layout and keeps prices readable; both themes have distinct opaque surfaces and visible controls.

Intentional differences from concepts: the store's saved teal brand accent is retained, with accessible text contrast in dark mode; actual catalog artwork, offers and prices replace illustrative content; the configured featured carousel and homepage sections remain available; the full existing checkout instructions and wallet review remain. Desktop home products use horizontal rails to keep configured lists compact. No fabricated region, seller, rating or payment claims were added.

Visual issues resolved during review: stale document direction after locale navigation, insufficient custom-accent contrast, account menu clipping in RTL, cropped offer logos, and mobile campaign image/background blending. Signed-in customer checkout, wallet, recharge and profile were inspected without submitting mutations. The signed-in dashboard retains its original chrome and has zero customer styling scopes.

Validation: 809 unit/regression tests and 73 browser checks passed, with one expected desktop skip of a mobile-only case. Browser checks cover Arabic/English, desktop/mobile, themes and persistence, campaign links/assets, search, locale direction, carousel interactions and overflow. Type checking, lint and production build pass; lint retains one pre-existing image warning in the original Next.js reference. Financial behavior is tested with mocks; no live purchase, recharge, support message, provider action or database settings update was performed. Changes remain local and are not deployed.

Screenshots are saved in `/Users/mbalkhi/.codex/visualizations/2026/09/06/01a07750-def5-7d71-820d-2a6f02a04b83/storefront/` (desktop/mobile in both themes, plus the product page).
