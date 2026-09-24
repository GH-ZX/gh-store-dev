# Owner guide for the September store upgrade

## Catalog and similar products

Dashboard → Catalog → open a product. Search aliases are visible and editable; add real Arabic/English brand spellings, common transliterations and useful product terms. All 81 existing products now have aliases. They support store search; Google receives useful visible product descriptions and normal structured data, not hidden keyword lists.

Each offer has an expandable duration/warranty editor. Automatic mode reads supplier names and descriptions. Manual mode preserves your decision across imports. NW is no warranty (zero days); W5D is five days; FW covers the subscription term; 18m is eighteen calendar months. Quotas such as 100M tokens are excluded. Twenty-four current offers contain ambiguous/conflicting terms and appear in the dashboard review queue. Confirm these with the supplier before choosing a manual value. Missing evidence remains unknown.

Keep a product as the service/brand and its offers as the genuinely comparable packages. Compare entitlement, account ownership/shared status, activation method, region, subscription duration, warranty and renewal terms. Different entitlements must remain clearly distinguishable. For duplicate supplier listings, choose the strongest existing product page, move only confirmed equivalent offers/mappings with a reviewed migration, preserve historical order data, and create redirects before retiring old URLs. This release does not merge products or change supplier prices. The runtime currently expects one selected supplier mapping per offer; see [provider onboarding](../operations/adding-providers.md).

## Homepage and imagery

The home page puts the available quick-buy choices before the brand carousel so a shopper sees products sooner. The carousel stays in place with product logos/wordmarks. Header categories come from active database categories. Suggested purchases show one available product from each category before filling remaining slots, up to six. Choices are sorted by current price, with up to twelve offers per card and a link to every offer. Quick buy opens checkout, where prices, required fields and wallet balance are checked again. It never purchases on the first click. New category shelves fill gaps in the configured homepage sections; empty shelves disappear. Discovery is cached for 30 seconds, category navigation for 60 seconds.

Product editor artwork fields:

| Role | Field | Use |
| --- | --- | --- |
| Logo / wordmark | `logo_url` | Carousel identity and bottom navigation |
| Large artwork | `image_url` | Carousel and product detail |
| Small artwork | `thumbnail_url` | Product cards and quick buy |

An empty thumbnail follows the current supplier image, then logo. Existing API assets are preserved. The generated `product-stage-v1.webp` is a shared 1536×1024 GH Store background; real product assets are composed on top for the large presentation of non-game items and product details. The refined carousel uses logos/wordmarks instead of visible product titles or descriptions. Imported supplier card covers stay within a bounded area over the generated background; custom game art keeps its configured fit. Missing or failed logos fall back to readable names, and links/buttons always retain full accessible product names. Gemini and ChatGPT use locally hosted vector marks; missing CapCut logos reuse the configured CapCut mark. This is one generated template reused across the catalog, not individually generated official brand logos. Future products inherit the template and fallback behavior automatically. Use authorized real logos, clear large art and a readable small image when adding manual overrides.

## Provider availability

Customer catalog, search, carousel and related-product lists include a product only when it has at least one active offer. A direct product URL with no active offers shows the unavailable state, and inactive offer URLs cannot enter checkout. Checkout validates the active offer again.

Supplier availability is the latest imported snapshot, not a live API request on each storefront page. Refresh the relevant catalog in Dashboard → Providers after a supplier stock change. BatStore offers with zero or missing stock are parked; an offer parked by stock sync returns when stock is positive again. Saving the offer manually clears that automatic-restock marker, so the administrator's decision stays in force. MaxStore's explicit availability and G2Bulk voucher stock already follow the same active-offer storefront filter. The generic G2Bulk top-up catalogue has no stock field in its documented response.

## USDT operating procedure

Use a manual method whose id is exactly `BEP20` for the on-chain rail; any legacy on-chain row is disabled by the hardening migration until reviewed. BEP20 requests snapshot the destination address. Customers submit a transaction hash and can correct it before review. Admin approval checks BSC chain 56, the allowlisted USDT contract, success, actual transfer logs to the saved address, canonical block and at least 20 confirmations. Only received funds can be credited; dust is rounded down to wallet cents. Approved transaction hashes are unique, and crediting plus ledger updates remain atomic/idempotent.

A transaction hash is public: confirm that the claimant actually paid, using the authenticated customer's withdrawal record or other trustworthy payer evidence. Record the verification in the admin note and check the ownership box. Do not approve merely because a hash appears on an explorer. Existing historical credits that never stored a hash cannot be retroactively matched automatically. Wrong network/token, partial payment or an old transfer goes to support; never invent a successful transfer to clear a queue. A chain RPC outage leaves the request uncredited for retry.

For automation later, use per-invoice checkout with a merchant processor, signed callbacks, read-only reconciliation, explicit underpayment/overpayment rules and a payout policy. Binance Pay is already integrated and now verifies the documented `orderAmount`, currency and order binding. A new processor needs an eligible merchant account and credentials; compare total processing/network/withdrawal costs at your actual basket size before choosing. A shared public wallet address alone cannot securely automate payer attribution.

Sources: [Binance query v2 contract](https://developers.binance.com/en/docs/products/binance-pay-merchant/api-order-query-v2), [BNB Chain RPC documentation](https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/), [NOWPayments invoice/status overview](https://nowpayments.io/help/dashboard/how-to-view-past-payments-and-purchases).

## PostHog

The store has anonymous daily event totals in its dashboard, independent of PostHog. Optional PostHog adds within-session funnels for visitors who opt in through footer Analytics preferences. After the experience-settings migration is applied, configure it in Dashboard → Website → PostHog with the project API key and region; the key stays behind admin RLS. The database is the source of truth; a missing setting or database failure disables forwarding. Legacy Worker bindings no longer enable it. Never place a personal API key in source code. Without a configured project, no PostHog events are sent and the optional control stays disabled.

Use the event sequence `store_catalog_view` → `store_product_view` or `store_quick_buy` → `store_checkout_view`. Also track `store_search`, `store_search_empty` and `store_recharge_view`. The API sends only event names and a random per-tab session ID after consent. No email, user ID, search text, URL, account form contents, wallet address, payment evidence or delivered codes; no autocapture or replay. DNT/GPC opts out. Withdrawal deletes the local session ID. No cross-session retention or revenue attribution is claimed: the store's paid-order/profit reports remain the revenue authority. Event counts can include bots and repeat views and are not unique-customer counts.

[PostHog capture API](https://posthog.com/docs/api/capture) documents the regional endpoints and anonymous profile setting. The lightweight integration uses that API and adds no third-party browser SDK.

## Identity, trust and search launch

1. Fill real merchant/operator identity, country, contact email, support channels and actual support hours. Do not invent a registration number, 24/7 coverage or delivery guarantee.
2. Explain exactly what an account/subscription buyer receives, activation requirements, device/region restrictions, delivery expectations and renewal behavior. Confirm supplier resale permission and product availability before advertising.
3. Keep refund and warranty information consistent with the offer and your real support process. Have local counsel review the business-specific terms where needed; the store cannot establish those facts from supplier titles.
4. Use Search Console to verify the production domain, submit `/sitemap.xml`, and inspect `/`, `/ar`, `/en` and `/ar/about`. The homepage and About page have separate canonical identities; Google must recrawl before its result can change. See [indexing operations](../operations/seo-indexing.md).
5. Write concise original descriptions and practical buying guides for the products you can reliably deliver. Use meaningful internal links and only real verified customer reviews. Start promotion with a small curated set and expand after successful deliveries.
6. Track failed search rate, checkout entry, paid orders, delivery failures, refunds, contribution margin and repeat purchases weekly. Improve the weakest real step before buying more traffic. There is no implementation that can guarantee ranking or popularity.

## First-customer acceptance

Run a designated small test with a spending limit through each enabled supplier/payment rail. Confirm Google/email sign-in, password reset, a real recharge, offer input validation, delivery, support and one refund. Automated tests did not purchase or deposit money. Check the reconciliation heartbeat, failure queue, supplier balances, backups and owner alerts. See [launch checklist](../operations/launch-checklist.md) and [incident response](../operations/incident-response.md).

The compact package selector takes inspiration from [Hesap's catalog flow](https://hesap.com.tr/); store content and assets are GH Store's own configured catalog.


## Dashboard SEO setup completed

Arabic and English homepage metadata and fourteen page entries are populated in `store_settings.seo` (migrations 20260924210000 and 20260924220000). Non-empty owner overrides were preserved. See [the copy](seo-settings.json); all values remain editable in Dashboard → Website → SEO / Page SEO. The share image uses the existing absolute GH Store image URL.

Saved Products/About/Best Sellers metadata now survives the server normalizer, which shares the dashboard route allowlist. A malformed optional social image no longer discards all public settings. Internal search remains noindex. This completes site-side metadata configuration; Search Console ownership and Google's selected canonical still require checking in the Google account.

References: [Google title links](https://developers.google.com/search/docs/appearance/title-link), [Google site names](https://developers.google.com/search/docs/appearance/site-names). No claim of Google recrawl or ranking improvement is made.
