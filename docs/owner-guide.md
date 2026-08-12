# GH-Store Owner Guide

GH-Store is a bilingual digital gaming store for game top-ups, redeem codes, and digital cards.

## Customer Journey

1. A customer creates an account or signs in.
2. The customer browses games, offers, and gift cards.
3. The customer adds balance through manual or automatic recharge.
4. The customer purchases a UID top-up or redeem code.
5. GH-Store fulfills the order through the configured provider.
6. The customer receives a status update, delivery details, and an invoice.

## Admin Areas

| Operation | Area |
|-----------|------|
| Orders and delivery | Dashboard -> Orders |
| Wallet recharge | Dashboard -> Recharges / Payments |
| Games and offers | Dashboard -> Catalog |
| Provider sync | Dashboard -> Providers |
| Homepage and theme | Dashboard -> Website |
| Reviews and messages | Dashboard -> Reviews / Support |
| Audit and health | Dashboard -> Operations |

## Important Safety Rules

- Do not run random SQL files against production.
- Never place provider API keys in the browser.
- Do not retry a delayed provider order as a new order.
- Do not refund a provider order until its final state is known.
- Keep the existing `echocore-store` project untouched while GH-Store is built.
