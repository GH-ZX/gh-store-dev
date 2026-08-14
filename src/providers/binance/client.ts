import "server-only";

import { log, logFailure } from "@/lib/logging/logger";
import { signedRequest, toMerchantTradeNo } from "@/providers/binance/signing";

/**
 * Binance Pay merchant client.
 *
 * `import "server-only"` makes it a build error for this module — and therefore
 * the merchant secret — to reach a client bundle.
 *
 * Follows `docs/providers/binance-pay.md`. Two things about this API differ from
 * the store's other integrations and are worth stating where the code is:
 *
 * 1. Requests are signed over the body **as sent**, so the body is serialised
 *    once by {@link signedRequest} and posted verbatim.
 * 2. A request is only accepted "within 1s" of its timestamp. That makes clock
 *    drift a real failure mode rather than a theoretical one, and it is why
 *    `INVALID_TIMESTAMP` is reported as its own thing instead of a generic
 *    refusal — the fix is on our side, not the customer's.
 *
 * Nothing here retries. A create that is repeated is refused by Binance as a
 * duplicate trade number, which is the behaviour the store wants, and a query is
 * cheap enough to leave to the caller's own schedule.
 */

const BASE_URL = "https://bpay.binanceapi.com";
const REQUEST_TIMEOUT_MS = 15_000;

export type BinanceErrorKind = "auth" | "signature" | "clock" | "duplicate" | "request" | "network";

export class BinanceError extends Error {
  readonly kind: BinanceErrorKind;
  readonly code: string | null;

  constructor(kind: BinanceErrorKind, message: string, code: string | null = null) {
    super(message);
    this.name = "BinanceError";
    this.kind = kind;
    this.code = code;
  }
}

/** The documented codes worth telling apart. */
function classify(code: string, message: string): BinanceError {
  switch (code) {
    case "400002":
      return new BinanceError("signature", "Binance rejected the request signature.", code);
    case "400003":
      return new BinanceError("clock", "The store's clock is outside Binance's window.", code);
    case "400004":
    case "400005":
      return new BinanceError("auth", "Binance rejected the merchant credentials.", code);
    case "400201":
      return new BinanceError("duplicate", "That payment was already created.", code);
    default:
      return new BinanceError("request", message || "Binance refused the request.", code);
  }
}

export type BinanceOrder = {
  prepayId: string;
  checkoutUrl: string;
  qrcodeLink: string | null;
  deeplink: string | null;
  expireTime: number | null;
};

export type BinanceOrderState = {
  status: string;
  /** Binance's own trade number, when it has one. */
  transactionId: string | null;
};

export class BinanceClient {
  private readonly apiKey: string;
  private readonly secret: string;

  constructor(options: { apiKey: string; secret: string }) {
    this.apiKey = options.apiKey;
    this.secret = options.secret;
  }

  private async post(path: string, body: unknown): Promise<Record<string, unknown>> {
    const request = signedRequest({ body, apiKey: this.apiKey, secret: this.secret });
    const startedAt = Date.now();
    let response: Response;

    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: request.headers,
        body: request.body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (error) {
      logFailure("provider.binance", "provider_unreachable", error, {
        provider: "binance",
        path,
        ms: Date.now() - startedAt,
      });

      throw new BinanceError("network", "Binance Pay could not be reached.");
    }

    const ms = Date.now() - startedAt;
    const payload = (await response.json().catch(() => null)) as {
      status?: string;
      code?: string;
      data?: unknown;
      errorMessage?: string;
    } | null;

    if (!payload || payload.status !== "SUCCESS") {
      const code = payload?.code ?? String(response.status);
      const error = classify(code, payload?.errorMessage ?? "");

      log.error("provider.binance", "provider_call_failed", {
        provider: "binance",
        path,
        status: response.status,
        code,
        kind: error.kind,
        ms,
      });

      throw error;
    }

    log.debug("provider.binance", "provider_call", {
      provider: "binance",
      path,
      status: response.status,
      ms,
    });

    return (payload.data ?? {}) as Record<string, unknown>;
  }

  /**
   * Open a payment.
   *
   * The trade number is derived from the recharge request rather than generated,
   * so pressing pay twice reaches the same Binance order instead of opening a
   * second one for a single top-up.
   */
  async createOrder(input: {
    rechargeRequestId: string;
    amount: number;
    currency: string;
    description: string;
    returnUrl: string;
    cancelUrl: string;
    webhookUrl?: string | null;
  }): Promise<BinanceOrder> {
    const data = await this.post("/binancepay/openapi/v3/order", {
      env: { terminalType: "WEB" },
      merchantTradeNo: toMerchantTradeNo(input.rechargeRequestId),
      orderAmount: input.amount,
      currency: input.currency,
      description: input.description,
      goodsDetails: [
        {
          // Virtual goods: a wallet top-up is not a shipped item.
          goodsType: "02",
          goodsCategory: "Z000",
          referenceGoodsId: toMerchantTradeNo(input.rechargeRequestId),
          goodsName: input.description,
        },
      ],
      returnUrl: input.returnUrl,
      cancelUrl: input.cancelUrl,
      // Echoed back on the notification, which is how a callback is tied to a
      // top-up without trusting anything else the callback says.
      passThroughInfo: input.rechargeRequestId,
      ...(input.webhookUrl ? { webhookUrl: input.webhookUrl } : {}),
    });

    const checkoutUrl = typeof data.checkoutUrl === "string" ? data.checkoutUrl : "";
    const prepayId = typeof data.prepayId === "string" ? data.prepayId : "";

    if (!checkoutUrl || !prepayId) {
      throw new BinanceError("request", "Binance created an order with nowhere to pay it.");
    }

    return {
      prepayId,
      checkoutUrl,
      qrcodeLink: typeof data.qrcodeLink === "string" ? data.qrcodeLink : null,
      deeplink: typeof data.deeplink === "string" ? data.deeplink : null,
      expireTime: typeof data.expireTime === "number" ? data.expireTime : null,
    };
  }

  /**
   * What Binance says about an order.
   *
   * This is the authority, not the webhook. The notification's own body shape is
   * the one part of this integration the published documentation would not give
   * up, so nothing credits a wallet on the strength of it — a callback only ever
   * causes this query, and this answer decides.
   */
  async queryOrder(rechargeRequestId: string): Promise<BinanceOrderState> {
    const data = await this.post("/binancepay/openapi/v2/order/query", {
      merchantTradeNo: toMerchantTradeNo(rechargeRequestId),
    });

    return {
      status: typeof data.status === "string" ? data.status : "UNKNOWN",
      transactionId: typeof data.transactionId === "string" ? data.transactionId : null,
    };
  }
}

/**
 * Whether Binance's own order status means the money is in.
 *
 * Only `PAID` settles. `EXPIRED`, `CANCELED`, `ERROR` and anything unrecognised
 * do not, and unrecognised deliberately sits with them: a status this store has
 * never seen is not evidence of payment, and treating it as one would credit a
 * wallet for nothing.
 */
export function isBinancePaid(status: string): boolean {
  return status.trim().toUpperCase() === "PAID";
}
