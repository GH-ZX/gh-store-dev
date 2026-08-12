# G2Bulk API — Implementation Reference

> **Source of truth:** this file (`docs/providers/g2bulk-api.md`) — agents use **only** this MD, not https://api.g2bulk.com/
> **Upstream origin:** https://api.g2bulk.com/ (content captured here 2026-07-12; update this file when the API changes)
> **Purpose:** Contract for G2Bulk integration in GH-Store (catalog sync, fulfillment, top-ups).
> **Agent rule:** Read this file + `.agents/skills/g2bulk-api/SKILL.md` before any G2Bulk work. Do not invent API behavior.

## Overview

The G2Bulk API lets you resell game top-ups, voucher codes, and digital goods from your own backend. Every call is JSON over HTTPS — no SDK. Orders are idempotent; delivery is instant or via a short poll.

- **Base URL:** `https://api.g2bulk.com/v1/`
- **API key & wallet:** Telegram bot [@G2BULKBOT](https://t.me/G2BULKBOT) (no separate dashboard signup)
- **Prices** move with exchange rates — always read `unit_price` / `amount` from the catalogue right before charging

### How a purchase flows

1. Browse `GET /category` and `GET /products` (vouchers) or `GET /games/:code/catalogue` (top-ups) to find what to sell.
2. Call the purchase or order endpoint with your API key.
3. Get codes back instantly, or poll the delivery URL until ready.
4. Reconcile against `GET /transactions` (every balance change is logged).

GH-Store maps this as: **sync** (admin) → **customer checkout** → **edge `fulfillOrder`** → poll/webhook → save codes or UID confirmation to `order_items`.

## GH-Store setup (do once)

1. Run `supabase_echocore_full.sql` in Supabase SQL Editor (includes G2Bulk schema).
2. Deploy edge function:
   ```bash
   supabase secrets set G2BULK_API_KEY=your_key_here
   supabase functions deploy g2bulk
   ```
3. Admin → **G2Bulk** tab: enable auto-fulfillment, paste API key, **Test connection**, **Save**.
4. Per game: set `g2bulk_game_code` (e.g. `pubgm`, `mlbb`).
5. Per offer: set `catalogue_name` (top-ups) or `product_id` (vouchers).

**Security:** API key lives in local secret files, Supabase secrets, and/or protected server settings. Never use a `NEXT_PUBLIC_` prefix.

---

## Quick facts

| Item | Value |
|------|-------|
| Main API base | `https://api.g2bulk.com/v1/` |
| SMM Panel base | `https://api.g2bulk.com/api/v2` |
| Auth (main API) | Header `X-API-Key: <key>` |
| Auth (SMM API) | Body field `key: <key>` |
| API key source | Telegram bot `@G2BULKBOT` (wallet-funded) |
| Format | JSON over HTTPS |
| Rate limit | 1000 requests / 10 seconds per key |
| Idempotency window | 30 minutes (UUID header) |
| Auth failure policy | Repeated 401s → **permanent IP ban** |

**Never expose the API key in client-side code.** Use a Supabase Edge Function, serverless proxy, or admin-only backend.

### Security notes (from official docs)

- Keys are tied to your wallet balance — treat them like a password.
- **Brute-force protection:** repeated failed auth (401) triggers a **permanent IP ban**. Cache your key; do not retry in a tight loop on 401.
- Public catalog endpoints (`/category`, `/products`, `/games`, `/games/:code/catalogue`, `/games/fields`, `/games/servers`, `/games/checkPlayerId`, `/games/eta`) need **no key**.

---

## Authentication

### Main API (`/v1/*`)

```http
X-API-Key: your_api_key_here
```

**Verify your key:**

```bash
curl -X GET https://api.g2bulk.com/v1/getMe \
  -H "X-API-Key: your_api_key_here"
```

Optional idempotency (purchase + game order):

```http
X-Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

- Must be exactly **36-character UUID**
- Same key within 30 min returns original response (no double charge)
- Omit header to skip idempotency

### SMM Panel (`/api/v2`)

Key goes in the **request body**, not a header:

```bash
curl https://api.g2bulk.com/api/v2 \
  -d key=your_api_key_here \
  -d action=balance
```

---

## Main API — Endpoints

### User

#### `GET /v1/getMe` (auth)

Verify key + read wallet balance.

**Response 200:**

```json
{
  "success": true,
  "user_id": 123456789,
  "username": "johndoe",
  "first_name": "John Doe",
  "balance": 8.74
}
```

---

### Catalog (public — no key)

#### `GET /v1/category`

List all categories.

#### `GET /v1/category/:id`

Products inside one category.

**Response 200:**

```json
{
  "success": true,
  "categories": [
    {
      "id": 1,
      "title": "PUBG Mobile UC Vouchers",
      "description": "",
      "image_url": "https://example.com/pubg.png",
      "product_count": 11
    },
    {
      "id": 2,
      "title": "Razer Gold Accounts",
      "description": "",
      "image_url": null,
      "product_count": 5
    }
  ]
}
```

#### `GET /v1/products`

All products with live pricing + stock.

#### `GET /v1/products/:id`

Single product — **fetch before purchase** (prices move with exchange rates).

**Response 200:**

```json
{
  "success": true,
  "products": [
    {
      "id": 1,
      "title": "60 UC Voucher",
      "description": "",
      "category_id": 1,
      "category_title": "PUBG Mobile UC Vouchers",
      "unit_price": 0.84,
      "face_value": 1,
      "image_url": null,
      "stock": 1006
    }
  ]
}
```

| Field | Notes |
|-------|-------|
| `unit_price` | Your cost in USD — always re-read before charging customer |
| `face_value` | Denomination on voucher; `null` if not set |
| `stock` | Live inventory |

---

### Voucher / code purchases (auth)

#### `POST /v1/products/:id/purchase`

| Body field | Type | Required | Description |
|------------|------|----------|-------------|
| `quantity` | integer | yes | Units to buy |

**cURL (official example — quantity 5, idempotency key):**

```bash
curl -X POST https://api.g2bulk.com/v1/products/1/purchase \
  -H "X-API-Key: your_api_key_here" \
  -H "X-Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{"quantity": 5}'
```

**Completed 200:**

```json
{
  "success": true,
  "order_id": 123,
  "transaction_id": 456,
  "product_id": 1,
  "product_title": "60 UC Voucher",
  "status": "COMPLETED",
  "delivery_items": ["KEY1", "KEY2", "KEY3"]
}
```

**Pending 200:**

```json
{
  "success": true,
  "order_id": 124,
  "transaction_id": 457,
  "product_id": 2,
  "product_title": "PSN $20 Gift Card",
  "status": "PENDING",
  "delivery_items": null,
  "poll_url": "/v1/orders/124/delivery"
}
```

#### `GET /v1/orders` (auth)

Paginated order history, newest first.

| Query | Type | Default | Max |
|-------|------|---------|-----|
| `page` | int | 1 | — |
| `limit` | int | 50 | 100 |
| `search` | string | — | optional filter |

```bash
curl -X GET "https://api.g2bulk.com/v1/orders?page=1&limit=50" \
  -H "X-API-Key: your_api_key_here"
```

**Response 200:**

```json
{
  "success": true,
  "orders": [
    {
      "id": 1,
      "user_id": 123456789,
      "product_id": 1,
      "product_title": "60 UC Voucher",
      "quantity": 1,
      "total_price": "0.840",
      "status": "COMPLETED",
      "description": "Purchase from G2Bulk Bot",
      "created_at": "2025-10-19T05:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 120,
    "total_pages": 3
  }
}
```

#### `GET /v1/orders/:id` (auth)

Single order by id.

**Order object fields:** `id`, `user_id`, `product_id`, `product_title`, `quantity`, `total_price`, `status`, `description`, `created_at`

#### `GET /v1/orders/:id/delivery` (auth)

Poll PENDING voucher orders every **2–5 seconds**. Most orders finish within **5–10 seconds**. Stop on **200** (codes ready) or **410** (auto-refunded). Pre-order mode for non-instant products will reuse the same `poll_url` pattern.

| HTTP | Meaning |
|------|---------|
| 200 | Codes ready in `delivery_items` |
| 202 | Still `PROCESSING` — poll again |
| 410 | Terminal failure — auto-refunded |
| 404 | Not found / not yours |

**Ready 200:**

```json
{
  "success": true,
  "order_id": 124,
  "product_id": 2,
  "product_title": "PSN $20 Gift Card",
  "quantity": 1,
  "status": "COMPLETED",
  "delivery_items": ["XXXX-XXXX-XXXX"]
}
```

**Processing 202:**

```json
{
  "success": true,
  "order_id": 124,
  "status": "PROCESSING",
  "message": "Order is still being fulfilled. Try again shortly."
}
```

**Refunded 410:**

```json
{
  "success": false,
  "order_id": 124,
  "status": "REFUNDED",
  "refunded": true,
  "message": "Order failed and was refunded automatically."
}
```

> Delivery items available **30 days** after `created_at` — persist codes in Supabase immediately.

#### `GET /v1/transactions` (auth)

Wallet ledger — every charge and top-up with `balance_before` / `balance_after` for exact reconciliation. Paginated like orders; optional `search` filter.

| `transaction_type` | Meaning |
|--------------------|---------|
| `add_balance` | Balance added — manual addition or refund |
| `charge_balance` | Balance deducted — purchase or top-up |

**Response 200:**

```json
{
  "success": true,
  "data": [
    {
      "id": 45,
      "user_id": 123456789,
      "transaction_type": "charge_balance",
      "amount": "1.126",
      "balance_before": "10.000",
      "balance_after": "8.874",
      "status": "success",
      "description": "Purchase PUBG Mobile 60 UC",
      "created_at": "2025-10-19T05:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 200,
    "total_pages": 4
  }
}
```

---

### Game top-up — direct to player (auth where noted)

#### `GET /v1/games` (public)

Supported games list.

```json
{
  "success": true,
  "games": [
    {
      "id": 1,
      "code": "pubg_mobile",
      "name": "PUBG Mobile",
      "image_url": "/images/pubg_mobile.png"
    },
    {
      "id": 2,
      "code": "free_fire",
      "name": "Free Fire",
      "image_url": "/images/free_fire.png"
    }
  ]
}
```

#### `POST /v1/games/fields` (public)

Required input fields per game.

| Body | Type | Required |
|------|------|----------|
| `game` | string | yes — e.g. `mlbb` |

```bash
curl -X POST https://api.g2bulk.com/v1/games/fields \
  -H "Content-Type: application/json" \
  -d '{"game": "mlbb"}'
```

```json
{
  "code": "200",
  "info": {
    "fields": ["userid", "serverid"],
    "notes": "Not available for Indonesia users"
  }
}
```

#### `POST /v1/games/servers` (public)

Server list for games that need it. **403 = no server required** (not an error — check `/games/fields` for real requirements).

```bash
curl -X POST https://api.g2bulk.com/v1/games/servers \
  -H "Content-Type: application/json" \
  -d '{"game": "mlbb"}'
```

```json
{
  "code": "200",
  "servers": {
    "SouthEast Asia": "SouthEast Asia",
    "America": "America",
    "Europe": "Europe"
  }
}
```

#### `POST /v1/games/checkPlayerId` (public)

Validate player before charging.

| Body | Type | Required |
|------|------|----------|
| `game` | string | yes |
| `user_id` | string | yes |
| `server_id` | string | if game requires |
| `charname` | string | if game requires |

**Request:**

```json
{
  "game": "mlbb",
  "user_id": "123456789",
  "server_id": "2001",
  "charname": "charname"
}
```

**Valid 200:**

```json
{
  "valid": "valid",
  "name": "John Doe",
  "openid": "41581795132966184"
}
```

> `charname` means different things per game (character, server, or account id). Read `notes` from `/games/fields`.

#### `GET /v1/games/:code/catalogue` (public)

Denominations + live `amount` (your cost).

```json
{
  "success": true,
  "game": { "code": "pubgm", "name": "PUBG Mobile", "image_url": "/images/pubgm.png" },
  "catalogues": [
    { "id": 1, "name": "60 UC",  "amount": 0.88 },
    { "id": 2, "name": "120 UC", "amount": 1.75 }
  ]
}
```

#### `POST /v1/games/eta` (public)

Estimated fulfillment time for a top-up denomination.

| Body | Type | Required |
|------|------|----------|
| `game` | string | yes |
| `catalogue_name` | string | yes |

| ETA label | Range |
|-----------|-------|
| `instant` | < 30s |
| `less_than_1_minute` | 30s – 1 min |
| `less_than_2_minutes` | 1 – 2 min |
| `less_than_5_minutes` | 2 – 5 min |
| `less_than_10_minutes` | 5 – 10 min |
| `less_than_30_minutes` | 10 – 30 min |
| `more_than_30_minutes` | > 30 min |
| `no_data` | insufficient data |

```json
{
  "success": true,
  "estimated_time": {
    "label": "less_than_5_minutes",
    "display": "Less than 5 minutes",
    "median_seconds": 187
  }
}
```

#### `POST /v1/games/:code/order` (auth)

Place direct top-up order.

| Body | Type | Required |
|------|------|----------|
| `catalogue_name` | string | yes — e.g. `"60 UC"` |
| `player_id` | string | yes |
| `server_id` | string | if applicable |
| `charname` | string | if applicable |
| `remark` | string | optional — your order note |
| `callback_url` | string | optional — webhook URL |

**Status values:** `PENDING` → `PROCESSING` → `COMPLETED` | `FAILED` (refunded)

**Request body:**

```json
{
  "catalogue_name": "60 UC",
  "player_id": "12345678",
  "server_id": "2001",
  "charname": "charname",
  "remark": "Optional note",
  "callback_url": "https://your-domain.com/webhook/order-status"
}
```

**Response 200:**

```json
{
  "success": true,
  "message": "Order created successfully. We are processing your order.",
  "order": {
    "order_id": 42,
    "game": "PUBG Mobile",
    "catalogue": "60 UC",
    "player_id": "12345678",
    "player_name": "PlayerName",
    "price": 0.88,
    "status": "PENDING",
    "callback_url": "https://your-domain.com/webhook/order-status"
  }
}
```

> GH-Store sets `remark` to the internal order id and passes `callback_url` when webhook mode is configured in the edge function.

#### `POST /v1/games/order/status` (auth)

Poll game top-up order status (alternative to webhook).

#### `GET /v1/games/orders` (auth)

Paginated game top-up order history.

**Response 200:**

```json
{
  "success": true,
  "orders": [
    {
      "order_id": 42,
      "game_code": "pubgm",
      "game_name": "PUBG Mobile",
      "player_id": "12345678",
      "player_name": "PlayerOne",
      "denom_id": "60",
      "price": 0.84,
      "status": "completed",
      "is_refunded": false,
      "created_at": "2025-10-19T05:30:00Z",
      "completed_at": "2025-10-19T05:31:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 85, "total_pages": 2 }
}
```

---

### Webhooks (game top-up)

Set `callback_url` on order creation. G2Bulk POSTs JSON when order reaches terminal state (`COMPLETED` or `FAILED`).

| Property | Value |
|----------|-------|
| Method | POST JSON |
| Timeout | 10 seconds |
| Retry | Once on failure |
| Your response | 2xx within 10s |

**Callback payload:**

```json
{
  "order_id": 42,
  "game_code": "pubgm",
  "game_name": "PUBG Mobile",
  "player_id": "12345678",
  "player_name": "PlayerName",
  "server_id": "2001",
  "denom_id": "60 UC",
  "price": 0.88,
  "status": "COMPLETED",
  "message": "Order completed successfully",
  "remark": "your order remark",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

> Handler must be **idempotent** (duplicate notifications possible after retry).

---

## SMM Panel API (`/api/v2`)

Same fulfillment, SMM-panel-style interface. All actions are `POST` with `action` in body.

### Actions

| action | Description |
|--------|-------------|
| `services` | List services + rates |
| `add` | Place order |
| `status` | Poll order status |
| `balance` | Wallet balance |

### `action=services`

| Body | Required |
|------|----------|
| `key` | yes |
| `action` | `"services"` |
| `category` | optional — filter by game |

```json
[
  {
    "service": 1,
    "name": "PUBG Mobile 60 UC",
    "type": "Package",
    "category": "PUBG Mobile",
    "rate": "0.88",
    "min": "1",
    "max": "1",
    "refill": false,
    "cancel": false
  }
]
```

### `action=add`

| Body | Required | Notes |
|------|----------|-------|
| `key` | yes | |
| `action` | `"add"` | |
| `service` | yes | From `services` |
| `link` | yes | Player ID, or `PlayerID\|ServerID\|Charname` |
| `quantity` | yes | Always `1` for game top-ups |

```json
{ "order": 12345 }
// or
{ "error": "Insufficient balance" }
```

### `action=status`

| Body | Required |
|------|----------|
| `order` | single ID **or** |
| `orders` | comma-separated, max 100 |

```json
{
  "charge": "0.88",
  "start_count": "0",
  "status": "Completed",
  "remains": "0",
  "currency": "USD"
}
```

SMM status values: `Pending`, `In progress`, `Completed`, `Partial`, `Canceled`

> SMM errors return **HTTP 200** with `{ "error": "..." }` — always check `error` field.

### `action=balance`

```json
{ "balance": "150.5000", "currency": "USD" }
```

### Common SMM errors

```
"Invalid API key"
"Invalid action"
"Service ID is required"
"Link (Player ID) is required"
"Service not found or inactive"
"Game is currently unavailable"
"Insufficient balance"
"Order not found"
```

---

## Reference — limits & status codes

### Operational limits (official)

| Limit | Value |
|-------|-------|
| Rate limit | 1000 requests / 10 seconds per key |
| Idempotency window | 30 minutes |
| Pending poll cadence | every 2–5 seconds |
| Typical completion | 5–10 seconds |
| Delivery item retention | 30 days after `created_at` |
| Page size max | 100 items |
| Auth failures | permanent IP ban on repeated 401s |

Use exponential backoff on **429** and **5xx**. Stop polling delivery on **200** (ready) or **410** (refunded terminal).

### HTTP status codes (main API)

| Code | Meaning |
|------|---------|
| 200 | OK — request successful |
| 202 | Accepted — still pending/processing, poll again |
| 400 | Bad request — invalid format or parameters |
| 401 | Unauthorized — auth failed or key invalid (**do not retry in a loop**) |
| 404 | Not found — resource does not exist |
| 410 | Gone — failed, refunded, or cancelled (terminal) |
| 429 | Too many requests — rate limit exceeded |
| 500 | Internal server error |

**Error shape:**

```json
{ "success": false, "message": "Human-readable error" }
```

**No servers (403):**

```json
{
  "detail": {
    "code": "403",
    "message": "Game does not requires any servers"
  }
}
```

---

## GH-Store — suggested integration map

When you provide the API key, implementation can follow this plan:

### 1. Config (admin settings)

Store in Supabase `store_settings` or env (server-only):

- `g2bulk_api_key` — never in frontend
- `g2bulk_markup_percent` — margin over `unit_price` / `amount` (default 15%)
- `g2bulk_charm_pricing_enabled` — optional tiered endings after markup (see below)
- `g2bulk_webhook_secret` — optional verify callback origin
- `g2bulk_enabled` — toggle

#### Storefront pricing (GH-Store)

Two separate amounts — do not confuse them:

| Amount | Field | Charged when |
|--------|-------|--------------|
| **Customer price** | `offers.price` | Customer pays (balance, checkout, Sam invoice) |
| **Supplier cost** | `offers.g2bulk_cost_usd` | G2Bulk debits **your G2Bulk wallet** on fulfill |

Flow:

1. Sync reads G2Bulk `amount` / `unit_price` → `g2bulk_cost_usd`
2. `price = markup(cost)`; if charm enabled → tiered round-up → stored as `offers.price`
3. `create_order_atomic` verifies `offers.price` server-side
4. Fulfill calls G2Bulk with `catalogue_name` / `product_id` only — **no retail price sent**

**Charm pricing** (`charmPricing.ts` / `src/lib/charmPricing.js`) — gentle tiers per dollar:

| After markup | Rounds up to |
|--------------|--------------|
| e.g. `0.43` | `0.49` |
| e.g. `1.25` | `1.49` |
| e.g. `1.68` | `1.89` |
| e.g. `0.85` | `0.99` |

Admin: enable toggle → **Apply charm prices** (`applyCharmPricing` edge action) to refresh synced offers.

**Admin UI:** supplier cost badge (`AdminOfferCostBadge`) shows `g2bulk_cost_usd` next to retail price.

### 2. Product types → G2Bulk endpoints

| Store offer type | G2Bulk flow |
|------------------|-------------|
| Game top-up (UID + server) | `checkPlayerId` → `games/:code/order` or SMM `add` |
| Voucher / gift card (codes) | `products/:id/purchase` → poll `/delivery` |
| Catalog sync (admin) | `GET /games`, `GET /games/:code/catalogue`, `GET /products` |

### 3. DB fields to add on orders

```
g2bulk_order_id       — their order_id
g2bulk_product_id     — product or catalogue id
g2bulk_status         — PENDING | PROCESSING | COMPLETED | FAILED | REFUNDED
g2bulk_delivery_items — jsonb array of codes (vouchers)
g2bulk_cost_usd       — what G2Bulk charged
g2bulk_idempotency_key — uuid we sent
g2bulk_remark         — links to our order id
```

### 4. Fulfillment flow (after ShamCash payment approved)

```
Admin approves payment
  → Edge function calls G2Bulk with X-Idempotency-Key = our order UUID
  → If COMPLETED: save delivery_items, notify user
  → If PENDING: poll delivery OR register webhook
  → On FAILED/410: mark order failed, alert admin
```

### 5. Player validation (BuyView)

Before checkout, proxy `POST /v1/games/checkPlayerId` so buyer sees in-game name confirmation (matches existing UID flow).

### 6. Pricing sync (optional cron)

Periodic job: fetch catalogue/products, apply markup (+ charm if enabled), update `offers.price` and `g2bulk_cost_usd` in Supabase.

SQL: `g2bulk_charm_pricing_enabled` column + `save_g2bulk_settings` — in `supabase_echocore_full.sql`.

---

## cURL cheat sheet

```bash
# Verify key + balance
curl -H "X-API-Key: $KEY" https://api.g2bulk.com/v1/getMe

# List games (public)
curl https://api.g2bulk.com/v1/games

# Game catalogue (public)
curl https://api.g2bulk.com/v1/games/pubgm/catalogue

# Validate player (public)
curl -X POST https://api.g2bulk.com/v1/games/checkPlayerId \
  -H "Content-Type: application/json" \
  -d '{"game":"mlbb","user_id":"123456789","server_id":"2001"}'

# Buy voucher (official example uses quantity 5 + fixed UUID)
curl -X POST https://api.g2bulk.com/v1/products/1/purchase \
  -H "X-API-Key: $KEY" \
  -H "X-Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{"quantity": 5}'

# Order history (paginated)
curl -X GET "https://api.g2bulk.com/v1/orders?page=1&limit=50" \
  -H "X-API-Key: $KEY"

# Poll delivery
curl -H "X-API-Key: $KEY" https://api.g2bulk.com/v1/orders/124/delivery

# Place top-up
curl -X POST https://api.g2bulk.com/v1/games/pubgm/order \
  -H "X-API-Key: $KEY" \
  -H "X-Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{
    "catalogue_name": "60 UC",
    "player_id": "12345678",
    "server_id": "2001",
    "charname": "charname",
    "remark": "echocore-001",
    "callback_url": "https://your-domain.com/webhook/order-status"
  }'

# SMM balance
curl https://api.g2bulk.com/api/v2 -d key=$KEY -d action=balance
```

---

## Implementation files

| File | Purpose |
|------|---------|
| `supabase/functions/g2bulk/index.ts` | Sync, check, fulfill, `applyCharmPricing` |
| `supabase/functions/g2bulk/charmPricing.ts` | Markup + tiered charm endings |
| `supabase/functions/g2bulk/gameCurrency.ts` | Pack currency at sync |
| `src/lib/g2bulk.js` | Frontend invoke wrapper |
| `src/lib/charmPricing.js` | Client charm preview (admin settings) |
| `src/lib/offerCost.js` | Wholesale cost helpers |
| `supabase_echocore_full.sql` §07–§13 | G2Bulk schema + charm toggle |
| `src/components/admin/AdminG2BulkSettings.jsx` | Key, markup, charm, sync |
| `src/components/admin/AdminOfferCostBadge.jsx` | Admin supplier-cost badge |
| `BuyView.jsx` | Player validation via proxy |

---

## Links

- Main API base: `https://api.g2bulk.com/v1/`
- SMM API base: `https://api.g2bulk.com/api/v2`
- API key / wallet: Telegram `@G2BULKBOT`
- Upstream docs UI (humans only — agents use this MD file): https://api.g2bulk.com/
