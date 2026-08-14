# Binance Pay (merchant)

Sources, read 2026-08-14:

- <https://developers.binance.com/docs/binance-pay/api-common> — auth, signing, errors
- <https://developers.binance.com/docs/binance-pay/api-order-create-v3> — create order
- <https://developers.binance.com/docs/binance-pay/webhook-common> — callback verification

Everything below is transcribed from those pages. Nothing has been run against a
live merchant account. The one part the published pages did **not** give up is
marked as such at the bottom, and the integration is built so that part cannot
cost anything if it is wrong.

## Connection

| | |
|---|---|
| Base host | `https://bpay.binanceapi.com` |
| Transport | HTTPS, `application/json`, UTF-8 |
| Outbound signing | HMAC-SHA512, hex, **uppercase** |
| Clock | requests are processed "within 1s" — the host must be NTP-synced |

### Request headers

All five are mandatory:

| Header | Value |
|---|---|
| `content-type` | `application/json` |
| `BinancePay-Timestamp` | Unix milliseconds |
| `BinancePay-Nonce` | exactly 32 characters, `a-z` and `A-Z` |
| `BinancePay-Certificate-SN` | the merchant API key |
| `BinancePay-Signature` | uppercase hex HMAC-SHA512 |

### The string that gets signed

```
payload = timestamp + "\n" + nonce + "\n" + body + "\n"
signature = HMAC_SHA512(payload, secretKey).hex().toUpperCase()
```

The trailing newline is part of it. `\n` means LF (`0x0A`) specifically, and the
body must be signed byte-for-byte as it is sent — serialise once, sign that
string, post that string.

## `POST /binancepay/openapi/v3/order`

Required: `merchantTradeNo` (≤32, letters and digits only — no dashes, which
rules out a bare UUID), `env.terminalType`, `goodsDetails`, `description`.

`currency` and `fiatCurrency` cannot both be null. `orderAmount` is required
alongside `currency`, minimum `0.00000001`. Useful optionals: `returnUrl`,
`cancelUrl`, `orderExpireTime` (ms, default 1 hour, max 15 days),
`passThroughInfo` (≤512, echoed back on the webhook), and `webhookUrl`, which
overrides whatever is configured in the merchant dashboard.

Response envelope is `status` (`SUCCESS` / `FAIL`), `code` (`000000` on
success), `data`, `errorMessage`. `data` carries `prepayId`, `checkoutUrl`,
`qrcodeLink`, `qrContent`, `deeplink`, `universalUrl`, `expireTime`, `currency`,
`totalFee`.

## Errors

`4000xx` transport and auth, `4001xx` parameter validation, `4002xx` business.
The ones worth naming: `400002 INVALID_SIGNATURE`, `400003 INVALID_TIMESTAMP`
(clock drift), `400004 INVALID_API_KEY_OR_IP`, `400201
INVALID_MERCHANT_TRADE_NO` (invalid **or duplicate**), `400202 ORDER_NOT_FOUND`.

## The callback signs differently, and this matters

Outbound requests are HMAC-SHA512 with the merchant secret. The **inbound**
webhook is signed by Binance with **RSA, verified against SHA-256**, and the key
is not the merchant secret — it is the `certPublic` field from the Query
Certificate API. `BinancePay-Certificate-SN` on the callback is documented as
the "MD5 hash value of public key", identifying which certificate to verify
against.

Verification is: rebuild `timestamp + "\n" + nonce + "\n" + body + "\n"`,
Base64-decode `BinancePay-Signature`, and verify it against the payload with the
public key using SHA-256.

Getting this backwards — checking an inbound callback with HMAC — would reject
every genuine notification, or worse, accept a forged one if the check were
skipped after it failed.

## What the published pages did not give up

The notification body — `bizType`, `bizId`, `bizStatus`, `data` — and the exact
acknowledgement body a merchant must return are documented per product, on pages
this reading could not reach. So:

- **The callback's status is never trusted.** It is treated purely as a signal
  that something happened, and the store then queries Binance for the order's
  real state before any money moves. That is the same stance the Sam callback
  takes for a different reason, and here it means an unknown or renamed
  `bizStatus` cannot credit a wallet by accident — the worst it can do is
  trigger a query that says "not paid".
- The acknowledgement is a `200` with `{"returnCode":"SUCCESS","returnMessage":null}`,
  which is the conventional shape. If it is wrong, Binance retries; every path
  here is idempotent, so a retry is harmless. Confirm it against a real
  notification and correct this file.
