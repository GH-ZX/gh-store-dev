# GH-Store SQL Inventory

## Legacy Source

`supabase/reference/gh-store-source-schema.sql` is a renamed and brand-normalized copy of the reference store's merged SQL file. It is a source document for extracting behavior, not an executable GH-Store migration.

The source contains roughly 11,800 lines and more than thirty sections, including:

- Core profiles, games, offers, orders, transactions, settings, reviews, and messages.
- RLS policies, storage policies, triggers, and helper RPCs.
- Manual ShamCash recharge and checkout.
- Notifications and admin notifications.
- G2Bulk fulfillment, catalog columns, sync, health, live catalog, pull selection, and hybrid catalog.
- Game regions, catalog segments, and dynamic top-up fields.
- Sam API wallets, invoices, transfers, and Syriatel support.
- User moderation, usernames, gifts, partners, influencers, and site logs.
- Development-only mock fulfillment and wallet tools.
- Optional destructive maintenance blocks.

## Active Migration Policy

Do not run the source file directly against the new database. Extract it into ordered migrations with tests:

1. Identity, roles, profiles, and admin helper functions.
2. Catalog, media, games, offers, regions, and dynamic fields.
3. Wallets, immutable transactions, recharge requests, and payment events.
4. Orders, order items, idempotency, fulfillment attempts, and status history.
5. Notifications, reviews, support, invoices, and audit logs.
6. Provider configuration, G2Bulk mappings, Sam invoices, and sync logs.
7. Website settings, themes, homepage layout, and SEO.

## Do Not Promote Automatically

- Mock fulfillment functions.
- Test wallet credit/reset functions.
- Data-wiping blocks.
- Duplicate historical versions of `create_order_atomic`.
- Legacy secret columns without an explicit security review.
- Old GitHub Pages deployment helpers.

## Other SQL

`site-logs-retention-dedupe.sql` is an operational patch already represented in the merged source. It is not a standalone bootstrap file for GH-Store.
