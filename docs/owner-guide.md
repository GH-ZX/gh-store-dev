# GH-Store Owner Guide

GH-Store is a bilingual digital gaming store for game top-ups, redeem codes, and digital cards.

## Customer Journey

1. A customer creates an account or signs in.
2. The customer browses games, offers, and gift cards.
3. The customer adds balance through manual or automatic recharge.
4. The customer purchases a UID top-up or redeem code.
5. GH-Store fulfills the order through the configured provider.
6. The customer receives a status update, delivery details, and an invoice.

## Getting Started

- **[How it works](owner-flows.md)** — every flow that exists today, what each one
  guarantees, and where to find it in the dashboard. Start here.
- **[Connecting G2Bulk](operations/connecting-g2bulk.md)** — your API key, the
  first administrator, and importing a real catalog.

## Admin Areas

| Operation | Area | Status |
|-----------|------|--------|
| Provider keys and catalog import | Dashboard -> Providers and API | Available |
| Store overview | Dashboard -> Home | Available |
| Games and offers editing | Dashboard -> Catalog | Available |
| Orders and delivery | Dashboard -> Orders | Available |
| Wallet recharge | Dashboard -> Recharges / Payments | Available |
| Homepage and theme | Dashboard -> Website | Available |
| Reviews and messages | Dashboard -> Reviews / Support | Available |
| Audit and health | Dashboard -> Operations | Available |

All listed areas are implemented. Before opening sales, verify the provider keys,
contact channels, payment methods, callback secrets, and visible catalog entries
from the dashboard.

## Important Safety Rules

- Do not run random SQL files against production.
- Never place provider API keys in the browser.
- Do not retry a delayed provider order as a new order.
- Do not refund a provider order until its final state is known.
- Keep the existing `echocore-store` project untouched.
- Never publish an offer until its provider mapping, price, delivery method, and
  required customer fields have been checked.
- Keep at least one small-value test product unpublished until the owner has
  verified the complete payment and fulfillment path.
