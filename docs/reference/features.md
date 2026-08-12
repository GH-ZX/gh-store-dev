# GH-Store Feature Matrix

## Customer Features

- Arabic and English localization with correct RTL/LTR behavior.
- Game top-up catalog with region, server, UID, and character fields.
- Gift cards and redeem-code catalog.
- Search, sale offers, suggested offers, homepage sections, and carousel.
- Persistent client cart with server-authoritative checkout totals.
- Customer wallet, manual recharge, automatic recharge, and transaction history.
- Secure order creation with idempotency and atomic wallet debit.
- UID fulfillment and redeem-code delivery.
- Order status, delivery receipt, invoice view, and PNG/PDF export.
- Notifications, reviews, contact, and support flows.
- Profile, password recovery, ban/status handling, and account preferences.

## Admin Features

- Dashboard overview and operational statistics.
- Game and offer CRUD through focused forms.
- Markup, fixed price, charm pricing, promotions, and sale controls.
- G2Bulk catalog sync, provider wallet, health, and fulfillment controls.
- Manual recharge approval and Sam API configuration.
- ShamCash, SyriatelCash, and Binance Pay configuration where enabled.
- Customer management, balance adjustments, bans, and username operations.
- Homepage section order, carousel selection, theme, and website settings.
- Reviews, support messages, notifications, site logs, and audit logs.
- IGDB image search and product media management.

## Non-Production Features

Developer wallet helpers, mock fulfillment, test receipts, destructive reset blocks, and development-only tools must be isolated behind explicit environment and admin gates. They must not be enabled in production builds.
