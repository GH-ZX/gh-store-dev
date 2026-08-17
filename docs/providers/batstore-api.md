# BatStore (VenteBot Reseller) API

Source: <https://ventetelegrambotrailway-production.up.railway.app/api/swagger/>,
transcribed 2026-08-17.

**Everything here is transcribed from that page, not observed.** No call has been
made against a live key yet, so treat this as the contract BatStore claims and
not as proven behaviour. The Providers page has a verify button that calls
`/api/reseller/me`; that is the first thing to run once a key exists, and
anything it contradicts belongs in this file immediately.

## Connection

| | |
|---|---|
| Base URL | `https://ventetelegrambotrailway-production.up.railway.app` |
| Auth | `X-Reseller-Key: <key>` request header |
| Where keys come from | the Telegram bot, or the Resellers tab as an admin |
| Alternate auth | `X-API-Key: <key>` (compatibility header) |
| Routes | every route is under `/api/reseller/` |
| Failures | JSON body: `success: false`, string `code`, `message` |

A second security scheme exists, `ResellerApiKey`, described as a compatibility
header for admin dashboard keys — the client uses `X-Reseller-Key`.

## Endpoints

### `GET /api/reseller/me`

Verify the key and read the wallet balance. No parameters. Returns
`success`, `user_telegram_id`, `username`, `first_name`, `wallet_balance`,
`key_name`, `key_prefix`.

This is the cheapest proof that a key works and shows the balance, which is what
the dashboard's verify button uses it for.

### `GET /api/reseller/products`

List active products. Optional `lang` query; supports an `If-None-Match` header
and answers 304 when unchanged. Each item carries `id`, `name`, `description`,
`emoji`, `image_url`, `price_usd`, `standard_price_usd`, `pricing_type`,
`special_price_expires_at`, `warranty_days`, `delivery_type`, `stock`,
`price_tiers`, `api_test`.

- `price_tiers` is a list of `{ min_qty, max_qty, price_usd }`.
- `api_test: true` marks a test product.

### `POST /api/reseller/quote`

Calculate the price before buying. Body: `{ product_id, quantity }`. Returns
`success`, `quote`, and the current `wallet_balance`.

### `POST /api/reseller/orders`

Create an order. Body (`CreateOrderRequest`):

| Field | Required | Notes |
|---|---|---|
| `product_id` | yes | from the products list |
| `quantity` | yes | |
| `activation_identifier` | yes | Telegram ID, Grok ID, email, or any service identifier to activate |
| `customer_reference` | no | internal customer reference from the reseller bot |
| `idempotency_key` | yes | unique per purchase attempt; retrying the exact same request returns the original order, reusing it with a different payload returns HTTP 409 |

Can answer 402 (insufficient balance) and 400/422 on a bad request.

### `GET /api/reseller/orders/{order_id}`

Read an order. Returns `id`, `status`, `product_id`, `product_name`,
`quantity`, `amount_usd`, `delivery_type`, `customer_reference`,
`idempotency_key`, `activation_identifier`, `created_at`, and `items` — each
item is `{ id, account_data }`, the delivered account.

### `POST /api/reseller/orders/{order_id}/activation-identifier`

Submit the activation identifier later. Body: `{ activation_identifier }`.
409 when the identifier is already set.

### `GET /api/reseller/wallet/transactions`

Reseller wallet history. Each entry: `id`, `user_telegram_id`, `type`, `amount`,
`balance_after`, `description`, `created_at`, `tx_hash`.

### `GET /api/reseller/wallet/deposit-methods`

Supported deposit networks and current minimums.

### `POST /api/reseller/wallet/deposits`

Create an idempotent USDT BEP20 wallet deposit. Body
(`DepositRequest`): `{ amount_usd, network, idempotency_key, reference }`.
Returns a `Deposit` with the deposit `address` and `memo`.

### `GET /api/reseller/wallet/deposits/{deposit_id}`

Read and optionally refresh a deposit. Returns the same `Deposit` shape.

### `GET /api/reseller/security`

Read IP and webhook settings.

### `PUT /api/reseller/security`

Configure IP allowlisting and signed deposit webhooks. Body
(`SecurityRequest`): `{ ip_allowlist, webhook_url, webhook_enabled,
rotate_webhook_secret }`. `webhook_signing_secret` is only returned after
initial enablement or an explicit rotation.
