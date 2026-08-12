# G2Bulk API — Official contract (strict)

**Canonical source:** `docs/providers/g2bulk-api.md` in this repo.

Do **not** use https://api.g2bulk.com/ during implementation — that content is already captured in the MD. If anything in code, comments, or memory disagrees with the MD, **the MD wins**. Fix code; do not improvise API behavior.

---

## Base URL & format

| API | Base |
|-----|------|
| Main | `https://api.g2bulk.com/v1/` |
| SMM panel | `https://api.g2bulk.com/api/v2` |

- JSON over HTTPS only
- API key from Telegram [@G2BULKBOT](https://t.me/G2BULKBOT) — wallet-funded, no dashboard signup

---

## Authentication (non-negotiable)

### Main API (`/v1/*`)

```http
X-API-Key: <secret>
```

- **Never** in browser, `NEXT_PUBLIC_*` env, or public RPC responses
- Repeated **401** → **permanent IP ban** — do not retry in a loop; validate key once

### Idempotency (purchase + game order only)

```http
X-Idempotency-Key: <36-char UUID>
```

- Same key within **30 minutes** → original response, no double charge
- Key length ≠ 36 → **rejected**
- Omit header entirely to skip idempotency

### Public endpoints (no key)

- `GET /v1/category`, `GET /v1/category/:id`
- `GET /v1/products`, `GET /v1/products/:id`
- `GET /v1/games`
- `POST /v1/games/fields`, `POST /v1/games/servers`
- `POST /v1/games/checkPlayerId`
- `GET /v1/games/:code/catalogue`
- `POST /v1/games/eta`

### SMM API (`/api/v2`)

- Key in **body** as `key`, not header
- Errors may return HTTP 200 with `{ "error": "..." }` — always check `error`

---

## Pricing

- `unit_price` (products) and `amount` (catalogue) = **supplier cost in USD**
- Prices move with exchange rates — **re-read immediately before** charging customer or placing order
- GH-Store: `g2bulk_cost_usd` = supplier; `offers.price` = customer (store markup / per-offer margin|fixed; no charm)

---

## Voucher purchase flow

`POST /v1/products/:id/purchase` body: `{ "quantity": <integer> }`

| Response `status` | Action |
|-------------------|--------|
| `COMPLETED` | Use `delivery_items` immediately |
| `PENDING` | Poll `poll_url` or `GET /v1/orders/:id/delivery` every **2–5 s** |

### Delivery poll HTTP codes

| HTTP | Meaning |
|------|---------|
| 200 | Codes in `delivery_items` — stop |
| 202 | `PROCESSING` — poll again |
| 410 | Terminal failure, auto-refunded — stop |
| 404 | Not found / not yours |

- Typical completion: **5–10 seconds**
- Save `delivery_items` within **30 days** of `created_at` — persist in Supabase immediately

---

## Game top-up flow

1. `GET /v1/games`
2. `POST /v1/games/fields` — required fields + `notes`
3. `POST /v1/games/servers` — **403 = no server required** (not an error)
4. `POST /v1/games/checkPlayerId` — validate before charge
5. `GET /v1/games/:code/catalogue` — live `amount` per denomination
6. `POST /v1/games/:code/order` — creates `PENDING` order
7. `POST /v1/games/order/status` or `callback_url` webhook

### Order body fields

| Field | Required |
|-------|----------|
| `catalogue_name` | yes |
| `player_id` | yes |
| `server_id` | if game requires |
| `charname` | if game requires |
| `remark` | optional |
| `callback_url` | optional |

### Top-up status lifecycle

`PENDING` → `PROCESSING` → `COMPLETED` | `FAILED` (refunded)

### Webhook (`callback_url`)

- POST JSON on terminal `COMPLETED` or `FAILED`
- 10 s timeout, **one retry** — handler must be **idempotent**

---

## Reconciliation

- `GET /v1/transactions` — ledger with `balance_before` / `balance_after`
- `transaction_type`: `add_balance` | `charge_balance`
- `GET /v1/orders` — voucher order history (paginated, max `limit=100`)

---

## Rate limits & errors

| Limit | Value |
|-------|-------|
| Rate | 1000 req / 10 s per key |
| Page size max | 100 |

| HTTP | Action |
|------|--------|
| 429, 5xx | Exponential backoff |
| 401 | Stop — fix key, do not hammer |

Error shape: `{ "success": false, "message": "..." }`

---

## Forbidden without doc evidence

- Inventing endpoints, query params, or body fields
- Guessing status strings or poll intervals
- Sending retail/customer price to G2Bulk on fulfill
- Client-side `X-API-Key` calls
- Non-UUID idempotency keys
- Treating `403` on `/games/servers` as a hard failure
