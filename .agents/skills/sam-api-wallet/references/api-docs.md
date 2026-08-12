# Sam API — Full Reference (static copy)

Source: https://sam-api.pro/api-docs
Base URL: `https://sam-api.pro/api`

## Authentication

Every authenticated request must include:

```
Authorization: Bearer sk_REDACTED_EXAMPLE
```

Alternative header:

```
X-Api-Key: sk_xxx...
```

---

## Wallets

### `GET /v1/wallets`

Returns all wallets linked to the API key owner. Fields vary by provider.

**Example**

```bash
curl https://sam-api.pro/api/v1/wallets \
  -H "Authorization: Bearer sk_xxx"
```

**Response**

```json
[
  {
    "id": "f9a0738f-eb67-492a-b4ba-e3f08238fac7",
    "provider": "shamcash",
    "providerDisplayName": "ShamCash",
    "label": "محمد أحمد علي",
    "phone": "0991234567",
    "walletAddress": "e5289b724c3a3a47581b575bfdf6cd53",
    "accountNumber": "SC-00012345",
    "region": "دمشق",
    "status": "active"
  },
  {
    "id": "a3c12f88-1b2c-3d4e-5f6a-7b8c9d0e1f2a",
    "provider": "syriatel",
    "providerDisplayName": "Syriatel Cash",
    "label": "محمد",
    "phone": "0931234567",
    "cashCode": "12345678",
    "status": "active"
  }
]
```

---

## ShamCash

### `GET /v1/wallets/shamcash/{walletAddress}/balance`

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| walletAddress | string | yes | Wallet UUID, 32-hex address, or account number |

**Response**

```json
[
  { "currency": "USD", "amount": 4.1, "label": null },
  { "currency": "SYP", "amount": 1606.5, "label": null },
  { "currency": "EUR", "amount": 0, "label": null }
]
```

### `GET /v1/wallets/shamcash/{walletAddress}/transactions`

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| walletAddress | string | yes | Wallet UUID, 32-hex, or account number |
| direction | string | no | `in` \| `out` \| `all` (default `all`) |

**Response**

```json
[
  {
    "id": "202235201",
    "type": "credit",
    "amount": 1600,
    "currency": "SYP",
    "counterparty": "حسين أحمد يوسف",
    "description": null,
    "status": null,
    "occurredAt": "2026-04-30T20:17:29"
  }
]
```

### `POST /v1/wallets/shamcash/{walletAddress}/transfer`

| Param | Type | Required |
|-------|------|----------|
| walletAddress | string | yes |

**Body (JSON)**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| recipientAddress | string | yes | 32-hex beneficiary wallet |
| currencyId | number | yes | 1=USD, 2=SYP, 3=EUR |
| amount | number | yes | Positive amount |
| note | string | no | Optional note |

**Response**

```json
{ "success": true, "message": "تم التحويل بنجاح" }
```

---

## Syriatel Cash

### `GET /v1/wallets/syriatel/{phoneOrCode}/balance`

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| phoneOrCode | string | yes | Wallet UUID, 10-digit phone, or 8-digit cash code |

**Response**

```json
[
  { "currency": "SYP", "amount": 25000, "label": null }
]
```

### `GET /v1/wallets/syriatel/{phoneOrCode}/transactions`

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| phoneOrCode | string | yes | UUID, phone, or cash code |
| direction | string | no | `in` \| `out` \| `all` |

**Response**

```json
[
  {
    "id": "TXN_12345",
    "type": "debit",
    "amount": 1000,
    "currency": "SYP",
    "counterparty": "0991234567",
    "description": null,
    "status": "completed",
    "occurredAt": "2026-04-30T18:00:00"
  }
]
```

### `POST /v1/wallets/syriatel/{phoneOrCode}/transfer`

| Param | Type | Required |
|-------|------|----------|
| phoneOrCode | string | yes |

**Body (JSON)**

| Field | Type | Required |
|-------|------|----------|
| toGsmOrCode | string | yes |
| amount | number | yes |
| pinCode | string | yes | 4-digit PIN |

**Response**

```json
{ "success": true, "message": "تمت العملية بنجاح" }
```

---

## Invoice system

### `POST /v1/invoices` (authenticated)

Creates a 15-minute invoice and returns a ready payment page URL. Requires active API subscription. The `identifier` wallet must be linked to your account.

**Body (JSON)**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| method | string | yes | `shamcash` or `syriatel` |
| identifier | string | yes | Receiving wallet ID — ShamCash: UUID / 32-hex / account number; Syriatel: phone (10) or cash code (8) |
| amount | string | yes | Required amount |
| currency | string | yes | `USD`, `SYP`, or `EUR` |
| webhookUrl | string | yes | POST URL for `invoice.paid` / `invoice.expired` |

**Response**

```json
{
  "invoiceId": "3f8a1c2d-4e5b-6f7a-8b9c-0d1e2f3a4b5c",
  "paymentUrl": "https://sam-api.pro/pay/3f8a1c2d-...",
  "expiresAt": "2026-05-01T14:15:00.000Z"
}
```

### `GET /pay/{invoiceId}` (public, no auth)

Returns full invoice data for the customer payment page. Auto-expires and fires webhook if timed out during fetch.

**Response**

```json
{
  "id": "3f8a1c2d-4e5b-6f7a-8b9c-0d1e2f3a4b5c",
  "method": "syriatel",
  "identifier": "0991234567",
  "amount": "5000",
  "currency": "SYP",
  "status": "pending",
  "expiresAt": "2026-05-01T14:15:00.000Z",
  "createdAt": "2026-05-01T14:00:00.000Z",
  "paidAt": null
}
```

### `POST /pay/{invoiceId}/verify` (public, no auth)

Searches receiving-wallet transactions for a matching transfer. On match, marks invoice `paid` and sends webhook immediately.

**Body**

```json
{ "transactionRef": "TXN_98765" }
```

**Responses**

```json
{ "verified": true,  "message": "تم التحقق من الدفع بنجاح" }
{ "verified": false, "message": "رقم العملية غير موجود في سجل المحفظة" }
```

HTTP 410 when expired:

```json
{ "verified": false, "message": "انتهت صلاحية الفاتورة", "code": "EXPIRED" }
```

---

## Webhooks

Sam API POSTs to your `webhookUrl` on pay or expire. Your server must respond HTTP 2xx.

### `invoice.paid`

```json
{
  "event": "invoice.paid",
  "invoiceId": "3f8a1c2d-...",
  "method": "syriatel",
  "identifier": "0991234567",
  "amount": "5000",
  "currency": "SYP",
  "transactionRef": "TXN_98765",
  "paidAmount": 5000,
  "counterparty": "0989876543",
  "paidAt": "2026-05-01T14:07:22.000Z"
}
```

### `invoice.expired`

```json
{
  "event": "invoice.expired",
  "invoiceId": "3f8a1c2d-...",
  "method": "syriatel",
  "identifier": "0991234567",
  "amount": "5000",
  "currency": "SYP",
  "expiredAt": "2026-05-01T14:15:00.000Z"
}
```

---

## Error codes

| HTTP | Code | Meaning |
|------|------|---------|
| 401 | MISSING_API_KEY / INVALID_API_KEY | Key missing or invalid |
| 400 | VALIDATION_ERROR | Invalid request body |
| 400 | INVALID_IDENTIFIER | Wallet ID format wrong for provider |
| 404 | NOT_FOUND | Wallet or invoice not found |
| 410 | EXPIRED | Invoice expired |
| 401 | WALLET_SESSION_EXPIRED | Re-link wallet in Sam dashboard |
| 502 | WALLET_UPSTREAM_ERROR | Cannot reach wallet provider |
| 502 | PROVIDER_ERROR | Provider rejected operation |
