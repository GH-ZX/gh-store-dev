# MaxStore API

Source: <https://maxstore1.com/api-docs>, read 2026-08-14.

**Everything here is transcribed from that page, not observed.** No call has been
made against a live key yet, so treat this as the contract MaxStore claims and
not as proven behaviour — the same standing rule the G2Bulk reference carries.
The Providers page has a verify button that calls `/api/v2/profile`; that is the
first thing to run once a key exists, and anything it contradicts belongs in this
file immediately.

## Connection

| | |
|---|---|
| Base URL | `https://maxstore1.com` |
| Auth | `api-token: <token>` request header |
| Where keys come from | the MaxStore Mini App, Account → API Keys |
| Rate limit | 60 requests/minute per key; orders 30/minute |
| Over the limit | HTTP 429 with a `Retry-After` header |

## Endpoints

### `GET /api/v2/profile`

Account and balance. No parameters. Returns `balance`, `user_id`, `username`.

This is the cheapest proof that a key works, which is what the dashboard's
verify button uses it for.

### `GET /api/v2/products`

Every product. Optional `products_id=12,15,20` to filter, and `base=1` for a
reduced shape.

Each item carries `id`, `name`, `price`, `params`, `category_id`, `available`,
`qty_values`, `product_type`.

- `qty_values` holds the `min`/`max` a quantity must respect.
- `product_type: "package"` means quantity is fixed at 1.
- `params` is the product's own dynamic fields — a player id and whatever else
  that particular product needs from the customer.

### `GET /api/v2/content/{category_id}`

`0` lists the categories; any other id lists that category's products. This is
how the catalogue divides into games, numbers, social media, support apps,
recharge accounts, and the rest. The docs give no response example, so the shape
is unknown until a key exists.

### `POST /api/v2/order`

| Field | Required | Notes |
|---|---|---|
| `product_id` | yes | from the products list |
| `qty` | yes | must respect `qty_values` |
| `order_uuid` | yes | UUIDv4, the idempotency key |
| `params` | depends | the product's dynamic fields |

Repeating an `order_uuid` returns the original order rather than placing a
second one — the provider's own idempotency, and the reason a purchase must
derive its UUID from something stable rather than generating a fresh one per
attempt.

Returns `status` and a `data` object with `order_id`, `status`, `price`, and a
nested `data` of the submitted params. Order status is one of `accept`, `wait`,
`reject`.

### `GET /api/v2/check?orders=<uuid,...>`

Up to 50 order UUIDs at once. Returns a `data` array of `order_id`, `quantity`,
`data`, `created_at`, `product_name`, `price`, `status`, `delivery`.

**There is no webhook.** Unlike G2Bulk, a finished MaxStore order is only ever
learned by asking — so the reconciliation sweep is not a backstop here, it is the
mechanism.

### `/api/v2/balance`

Listed under its own heading with neither a method nor a response example. Not
implemented; `/api/v2/profile` already answers the balance question.

## Errors

Failures arrive as `{"detail": {"code": 100, "message": "Insufficient balance"}}`.

| Code | Meaning |
|---|---|
| 100 | Insufficient balance |
| 105 | Quantity unavailable |
| 106 | Missing required field |
| 109 | Product deleted or not found |
| 110 | Product unavailable |
| 111 | Too many requests |
| 114 | Unknown error |
| 120 | Token required |
| 121 | Token error |
| 122 | API use not permitted |
| 123 | IP blocked |
| 130 | Maintenance |

The store maps these onto the same failure kinds it already uses for G2Bulk —
`auth`, `rate_limit`, `request`, `server`, `network`, `contract` — so a screen
that reports a supplier failure does not need to know which supplier it was.

## How the store uses it

- **Catalogue.** `/api/v2/products` is the source of truth, not `/api/v2/content`.
  Products carry `category_id`, so the store groups them itself and each
  category becomes a container game with its products as offers. `content/0` is
  consulted only for nicer category names and its failure costs nothing — the
  import must not depend on the one endpoint whose contract is a guess.
- **Fulfilment.** `order_uuid` is the order item's id, so the provider's own
  idempotency covers every retry: checkout, an operator, and the sweep all send
  the same uuid and the second one returns the first one's order.
- **Settling.** There is no callback, so the reconciliation sweep is not a
  backstop here — it is the mechanism. It polls `/check` for MaxStore orders and
  `/games/orders` for G2Bulk ones, keyed off which provider owns the offer.

## Still to prove

Every line above is written from the documentation. When a token exists, the
order to check things in:

1. Verify on the Providers page — proves auth and `/profile`.
2. Open the import screen — proves `/products`, and shows whether `/content/0`
   yields names or the store falls back to "Category 12".
3. Import one small category, then look at the offers it made.
4. Buy one cheap product end to end, and watch the attempt row: `params` is the
   least certain part of this integration, since the documentation describes it
   only as "product-specific dynamic fields, e.g. player_id".
