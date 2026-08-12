# GH-Store Route Contract

This is the functional route contract extracted from the reference store. The final Next.js route files may use locale segments, but each capability must remain available.

## Public Storefront

| Capability | Route contract |
|------------|----------------|
| Home | `/` and localized equivalent |
| All games | `/games` |
| Gift cards | `/gift-cards` |
| Search | `/search` |
| Sale offers | `/sale` |
| Game detail | `/game/:slug` |
| Offer detail | `/game/:gameSlug/:offerSlug` |
| FAQ | `/faq` |
| How it works | `/how` |
| Contact | `/contact` |
| Privacy | `/privacy` |
| Terms | `/terms` |
| Links | `/links` |

## Customer Routes

| Capability | Route contract |
|------------|----------------|
| Login | `/login` |
| Profile | `/profile` |
| Cart | `/cart` |
| Checkout | `/checkout` |
| Recharge | `/recharge` |
| Success | `/success` |
| Invoice | `/invoice/:kind/:id` |
| Notifications | `/notifications` |
| Orders | `/profile` and order detail views |

## Protected and Admin Routes

| Capability | Route contract |
|------------|----------------|
| Admin dashboard | `/dashboard` |
| Catalog and pricing | `/dashboard/catalog` |
| Orders and fulfillment | `/dashboard/orders` |
| Recharges | `/dashboard/recharges` |
| Payments | `/dashboard/payments` |
| Providers | `/dashboard/providers` |
| Website and theme | `/dashboard/website` |
| Reviews | `/dashboard/reviews` |
| Support and inbox | `/dashboard/support` |
| Audit and operations | `/dashboard/operations` |

## Compatibility

Legacy paths from the reference store must either redirect to the new canonical route or return a deliberate not-found response. No legacy route may silently expose another customer's data.
