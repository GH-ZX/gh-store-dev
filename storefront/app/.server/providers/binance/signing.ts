import { createHmac, randomBytes } from "node:crypto";

/**
 * Binance Pay request signing.
 *
 * Pure and separate from the client so it can be tested directly — this is the
 * single most breakable part of the integration, and every failure mode looks
 * identical from the outside (`400002 INVALID_SIGNATURE`) whether the fault is
 * the payload order, the newline, the case of the hex, or a body that was
 * serialised twice.
 *
 * Per `docs/providers/binance-pay.md`:
 *
 *     payload   = timestamp + "\n" + nonce + "\n" + body + "\n"
 *     signature = HMAC_SHA512(payload, secret).hex().toUpperCase()
 *
 * The trailing newline is part of it, `\n` is LF, and the body must be the exact
 * string that gets posted. That last point is why {@link signedRequest} returns
 * the body it signed rather than taking an object and letting the caller
 * serialise it again — two `JSON.stringify` calls on the same object are not
 * guaranteed to produce the same bytes once anything reorders a key.
 */

/** Documented as exactly 32 characters, letters only. */
const NONCE_LENGTH = 32;
const NONCE_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function createNonce(): string {
  const bytes = randomBytes(NONCE_LENGTH);
  let nonce = "";

  for (let index = 0; index < NONCE_LENGTH; index += 1) {
    nonce += NONCE_ALPHABET[bytes[index] % NONCE_ALPHABET.length];
  }

  return nonce;
}

export function buildPayload(timestamp: number | string, nonce: string, body: string): string {
  return `${timestamp}\n${nonce}\n${body}\n`;
}

export function sign(payload: string, secret: string): string {
  return createHmac("sha512", secret).update(payload, "utf8").digest("hex").toUpperCase();
}

export type SignedRequest = {
  body: string;
  headers: Record<string, string>;
};

/**
 * Everything needed to send one request, signed over the body it returns.
 *
 * `timestamp` and `nonce` are parameters rather than generated inside, so a test
 * can pin them and compare against a known signature.
 */
export function signedRequest(input: {
  body: unknown;
  apiKey: string;
  secret: string;
  timestamp?: number;
  nonce?: string;
}): SignedRequest {
  const body = JSON.stringify(input.body);
  const timestamp = input.timestamp ?? Date.now();
  const nonce = input.nonce ?? createNonce();

  return {
    body,
    headers: {
      "content-type": "application/json",
      "BinancePay-Timestamp": String(timestamp),
      "BinancePay-Nonce": nonce,
      "BinancePay-Certificate-SN": input.apiKey,
      "BinancePay-Signature": sign(buildPayload(timestamp, nonce, body), input.secret),
    },
  };
}

/**
 * A merchant trade number Binance will accept.
 *
 * Documented as at most 32 characters, letters and digits only — which rules out
 * a bare UUID, since the dashes are not permitted. Derived from the recharge
 * request's id rather than generated, so the same top-up always produces the
 * same trade number and a repeated create is refused by Binance itself as a
 * duplicate (`400201`) instead of opening a second invoice for one payment.
 */
export function toMerchantTradeNo(rechargeRequestId: string): string {
  return rechargeRequestId.replace(/-/g, "").slice(0, 32);
}
