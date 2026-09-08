# Search indexing

The public storefront uses `/ar` and `/en` URLs. Each public page identifies its
own canonical URL and both language versions. Collection pages after page 1
keep `?page=N` in their canonical and language links. Tracking parameters are
excluded from those links.

`/sitemap.xml` contains public information pages, active category pages, and
active products in both languages. Products without a category use
`/products/:slug`; an old product URL redirects to the current canonical path.
A temporary catalog query failure returns an uncached `503` with `Retry-After`,
instead of serving an incomplete sitemap as a successful response.

## Crawl and indexing rules

- Public product pages and their artwork are crawlable. The explicit
  `/api/media-proxy?` allowance takes precedence over the general API exclusion.
- Account, payment, dashboard, and private document routes are excluded at their
  actual route boundaries. A public product whose name contains `search`,
  `profile`, or `checkout` is not excluded by that name.
- Internal search pages remain crawlable and carry `noindex, follow`, allowing
  a crawler to read the indexing instruction and discover product links.
- Authentication and authorization protect private data. Robots rules control
  crawl traffic and do not provide access control.

Google explains the distinction in its
[robots.txt guide](https://developers.google.com/search/docs/crawling-indexing/robots/intro)
and [robots meta tag documentation](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag).
The collection canonical policy follows Google's
[pagination guidance](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading).

## Verify a release

1. Check that [robots.txt](https://gh-store.me/robots.txt) and
   [sitemap.xml](https://gh-store.me/sitemap.xml) return `200` on the production
   domain. Confirm the sitemap advertises `https://gh-store.me`, includes active
   products without categories, and has no private or search URLs.
2. Inspect representative product, offer, and category pages in both languages.
   Their server-rendered HTML should contain a title, nonempty description,
   canonical URL, and reciprocal language links. Check
   `/en/products?page=2` has a canonical ending in `?page=2`.
3. Test an offer URL in Google's
   [Rich Results Test](https://search.google.com/test/rich-results).
   Its `Product` data should show the visible package and public price.
   Availability and reviews are omitted when the page has no verified data for
   them; different package sizes are not combined as an `AggregateOffer`.

The automated crawl-resource and metadata regression suites run with:

```sh
pnpm exec vitest run --config storefront/vitest.config.ts tests/storefront/seo.test.ts tests/storefront/store-seo.test.ts tests/storefront/crawl-resources.test.ts
```

## Review a Search Console robots report

Export example URLs from the reported “Blocked by robots.txt” group first. A
count alone does not identify a defect: private account or checkout URLs are
intentionally excluded, while public product or image URLs should be reviewed.

For affected public URLs, run Search Console's live URL inspection after the
release. Confirm that crawling is allowed, the page renders, the canonical is
correct, and an old category URL redirects to the current product. Submit
`https://gh-store.me/sitemap.xml` in the Sitemaps report, then request validation
for the affected public URLs. A crawlable `noindex` search page should remain
excluded from search results.

Changes appear in Search Console after Google recrawls the URLs. The repository
cannot establish that a reported count has cleared without access to the
property's updated report.

The schema choices follow Google's
[organization guidance](https://developers.google.com/search/docs/appearance/structured-data/organization)
and [product snippet guidance](https://developers.google.com/search/docs/appearance/structured-data/product-snippet).
