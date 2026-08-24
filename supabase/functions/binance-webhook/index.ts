import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Binance Pay payment notification.
 *
 * Hosted here rather than on the store because this address is public wherever
 * the store is running — the same reason the Sam and G2Bulk callbacks are edge
 * functions. Binance is given this URL on the order itself, so the store and its
 * callback cannot drift apart.
 *
 * Two things make this receiver unusual, and both come from
 * `docs/providers/binance-pay.md`:
 *
 * 1. **The signature is not the one used outbound.** Requests to Binance are
 *    signed HMAC-SHA512 with the merchant secret; this notification is signed by
 *    Binance with RSA and verified against SHA-256, using a public key fetched
 *    from their certificate endpoint. Reaching for the merchant secret here
 *    would reject every genuine notification.
 *
 * 2. **The body is not trusted at all.** The notification's field names and its
 *    status values are the one part of that API the published documentation
 *    would not give up. So this reads exactly one thing out of the payload —
 *    which order it concerns — and then asks Binance directly whether that order
 *    is paid. An unknown or renamed status cannot credit a wallet; the worst it
 *    can do is trigger a query that answers "no".
 *
 * `verify_jwt` is off — Binance cannot send a Supabase JWT — so the signature
 * check below is the only gate.
 */

const BINANCE_HOST = "https://bpay.binanceapi.com";

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...(status === 405 ? { allow: "POST" } : {}),
    },
  });
}

/**
 * The conventional acknowledgement.
 *
 * Not confirmed against a live notification — see the docs file. If it is wrong
 * Binance retries, and every path here is idempotent, so a retry costs nothing.
 */
function acknowledge(): Response {
  return json({ returnCode: "SUCCESS", returnMessage: null }, 200);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** The same payload construction the outbound side uses, rebuilt over what arrived. */
function buildPayload(timestamp: string, nonce: string, body: string): string {
  return `${timestamp}\n${nonce}\n${body}\n`;
}

function pemToDer(pem: string): Uint8Array {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

/**
 * Verify Binance's signature over the raw body.
 *
 * The body must be the bytes as received: re-serialising parsed JSON would
 * reorder or respace it and the signature would never match.
 */
async function verifySignature(input: {
  publicKeyPem: string;
  timestamp: string;
  nonce: string;
  body: string;
  signature: string;
}): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "spki",
      pemToDer(input.publicKeyPem),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const signature = Uint8Array.from(atob(input.signature), (character) =>
      character.charCodeAt(0),
    );

    return await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      signature,
      new TextEncoder().encode(buildPayload(input.timestamp, input.nonce, input.body)),
    );
  } catch {
    // A malformed key or signature is a failed verification, not an error worth
    // answering 500 to — a 5xx would earn a retry of something that cannot pass.
    return false;
  }
}

/** Sign an outbound request the way Binance requires: HMAC-SHA512, uppercase hex. */
async function signRequest(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));

  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function createNonce(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(32));

  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

async function callBinance(
  path: string,
  body: unknown,
  credentials: { apiKey: string; secret: string },
): Promise<Record<string, unknown> | null> {
  const serialised = JSON.stringify(body);
  const timestamp = String(Date.now());
  const nonce = createNonce();

  const response = await fetch(`${BINANCE_HOST}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "BinancePay-Timestamp": timestamp,
      "BinancePay-Nonce": nonce,
      "BinancePay-Certificate-SN": credentials.apiKey,
      "BinancePay-Signature": await signRequest(
        buildPayload(timestamp, nonce, serialised),
        credentials.secret,
      ),
    },
    body: serialised,
  });

  const payload = (await response.json().catch(() => null)) as
    | { status?: string; data?: unknown }
    | null;

  return payload?.status === "SUCCESS" ? ((payload.data ?? {}) as Record<string, unknown>) : null;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST") {
    return json({ returnCode: "FAIL", returnMessage: "method_not_allowed" }, 405);
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!serviceKey || !supabaseUrl) {
    return json({ returnCode: "FAIL", returnMessage: "not_configured" }, 503);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: settings, error: settingsError } = await supabase
    .from("store_settings")
    .select("providers")
    .eq("id", "global")
    .maybeSingle();

  if (settingsError) {
    return json({ returnCode: "FAIL", returnMessage: "settings_unavailable" }, 503);
  }

  const binance = (settings?.providers as { binance?: Record<string, unknown> } | null)?.binance;
  const apiKey = text(binance?.api_key);
  const secret = text(binance?.api_secret);

  if (!apiKey || !secret) {
    return json({ returnCode: "FAIL", returnMessage: "not_configured" }, 503);
  }

  // Read once, as bytes: the signature covers exactly these characters.
  const body = await request.text();
  const timestamp = request.headers.get("BinancePay-Timestamp") ?? "";
  const nonce = request.headers.get("BinancePay-Nonce") ?? "";
  const signature = request.headers.get("BinancePay-Signature") ?? "";

  if (!timestamp || !nonce || !signature) {
    return json({ returnCode: "FAIL", returnMessage: "unsigned" }, 401);
  }

  /*
   * The verification key comes from Binance, not from configuration: it is the
   * `certPublic` field of their certificate endpoint. Fetched per notification
   * rather than cached, which costs a round trip and removes any chance of
   * verifying against a certificate that has since been rotated.
   *
   * The endpoint can answer with several certificates — old and new during a
   * rotation, and the notification is signed by whichever was current when it
   * was made. So every returned key is tried until one verifies; picking the
   * first blindly would reject half of all notifications for as long as the
   * rotation lasts.
   */
  const certificate = await callBinance("/binancepay/openapi/certificates", {}, { apiKey, secret });
  const candidates: string[] = [];

  if (Array.isArray(certificate)) {
    for (const entry of certificate) {
      const pem = text((entry as { certPublic?: unknown } | null)?.certPublic);

      if (pem) {
        candidates.push(pem);
      }
    }
  } else if (certificate && typeof certificate === "object") {
    const pem = text((certificate as { certPublic?: unknown }).certPublic);

    if (pem) {
      candidates.push(pem);
    }
  }

  if (candidates.length === 0) {
    // Without a key nothing can be verified, and an unverified notification is
    // not something to act on. 5xx so Binance retries once the endpoint is back.
    return json({ returnCode: "FAIL", returnMessage: "no_certificate" }, 503);
  }

  let verified = false;

  for (const publicKeyPem of candidates) {
    if (
      await verifySignature({
        publicKeyPem,
        timestamp,
        nonce,
        body,
        signature,
      })
    ) {
      verified = true;
      break;
    }
  }

  if (!verified) {
    return json({ returnCode: "FAIL", returnMessage: "unauthorized" }, 401);
  }

  let payload: Record<string, unknown>;

  try {
    payload = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return json({ returnCode: "FAIL", returnMessage: "invalid_json" }, 400);
  }

  /*
   * The only thing read out of the notification: which order it is about.
   * `bizId` is documented as the identifier and `data` as a JSON string that
   * carries the merchant's own trade number, so both are tried — and the
   * `passThroughInfo` we set at creation is the last resort.
   */
  const inner = (() => {
    const raw = payload.data;

    if (typeof raw !== "string") {
      return (raw ?? {}) as Record<string, unknown>;
    }

    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  })();

  const merchantTradeNo =
    text(inner.merchantTradeNo) ??
    text(payload.merchantTradeNo) ??
    text(inner.passThroughInfo)?.replace(/-/g, "").slice(0, 32) ??
    null;

  if (!merchantTradeNo) {
    // Acknowledged rather than refused: a notification about something this
    // store does not recognise is not a failure Binance can fix by retrying.
    return acknowledge();
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("binance_invoices")
    .select("merchant_trade_no, recharge_request_id, status, charge_amount, user_id")
    .eq("merchant_trade_no", merchantTradeNo)
    .maybeSingle();

  if (invoiceError) {
    return json({ returnCode: "FAIL", returnMessage: "invoice_lookup_failed" }, 503);
  }

  if (!invoice) {
    return acknowledge();
  }

  if (["credited", "failed", "expired", "cancelled"].includes(invoice.status)) {
    // Settled already. Acknowledging stops the retries for something there is
    // nothing left to do about.
    return acknowledge();
  }

  /*
   * The query, not the payload, decides. This is the whole design: the store
   * asks Binance about the order it was told to look at, and credits only on
   * that answer.
   */
  const order = await callBinance(
    "/binancepay/openapi/v2/order/query",
    { merchantTradeNo },
    { apiKey, secret },
  );

  const status = text(order?.status)?.toUpperCase() ?? "";

  if (status !== "PAID") {
    if (["EXPIRED", "CANCELED", "CANCELLED", "ERROR"].includes(status)) {
      const { error } = await supabase.rpc("fail_binance_invoice", {
        p_merchant_trade_no: merchantTradeNo,
        p_status: status === "EXPIRED" ? "expired" : "cancelled",
        p_payload: { source: "webhook", status },
      });

      if (error) {
        return json({ returnCode: "FAIL", returnMessage: "invoice_update_failed" }, 500);
      }
    }

    return acknowledge();
  }

  const { error } = await supabase.rpc("credit_binance_invoice", {
    p_merchant_trade_no: merchantTradeNo,
    // What the invoice billed, now confirmed paid by Binance itself.
    p_paid_amount: invoice.charge_amount,
    p_transaction_id: text(order?.transactionId) ?? undefined,
    p_payload: { source: "webhook", status },
  });

  if (error) {
    // A failure on our side answers 5xx so Binance retries, rather than
    // swallowing a credit that did not happen inside a success.
    return json({ returnCode: "FAIL", returnMessage: "credit_failed" }, 500);
  }

  /*
   * The customer is the only person who finds out, so the notification is
   * attempted and its result ignored — a failed message must never fail the
   * credit that already happened.
   */
  await supabase
    .from("notifications")
    .insert({
      user_id: invoice.user_id,
      notification_type: "recharge_approved",
      title_ar: "تمت إضافة الرصيد",
      title_en: "Your balance was topped up",
      body_ar: "أضفنا رصيدك بعد تأكيد الدفع عبر Binance Pay.",
      body_en: "We added your top-up after Binance Pay confirmed the payment.",
      href: "/wallet",
      entity_type: "recharge",
    })
    .then(() => undefined, () => undefined);

  return acknowledge();
});
