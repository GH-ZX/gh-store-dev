import "server-only";

import { z } from "zod";
import { log, logFailure } from "@/lib/logging/logger";
import { sanitisePath } from "@/lib/logging/outcome";
import { BatStoreError, classifyBatStoreStatus } from "@/providers/batstore/errors";
import {
  orderSchema,
  productsSchema,
  toBatStoreOrder,
  toBatStoreProduct,
  type BatStoreAccount,
  type BatStoreOrder,
  type BatStoreProduct,
} from "@/providers/batstore/schemas";

/**
 * BatStore (VenteBot Reseller) API client.
 *
 * BatStore is a Telegram-bot reseller API: it holds a wallet balance on the
 * reseller's behalf and delivers products (games, accounts, emails) against an
 * activation identifier such as a Telegram ID or email address.
 *
 * `import "server-only"` makes it a build error for this module — and so the
 * key — to reach a browser bundle.
 *
 * Contract notes that are easy to get wrong:
 * - The key travels in the `X-Reseller-Key` header, never a query string.
 * - Every route lives under `/api/reseller/`.
 * - Failures are JSON bodies with `success: false` plus a string `code`, so the
 *   HTTP status carries the grouping.
 * - Order creation is idempotent on `idempotency_key`: retrying the exact same
 *   body returns the original order, and reusing the key with a different body
 *   answers 409.
 */

const BASE_URL = "https://ventetelegrambotrailway-production.up.railway.app";
const REQUEST_TIMEOUT_MS = 15_000;

const meSchema = z.object({
  success: z.boolean().nullish(),
  user_telegram_id: z.union([z.string(), z.number()]).nullish(),
  username: z.string().nullish(),
  first_name: z.string().nullish(),
  wallet_balance: z.union([z.string(), z.number()]).nullish(),
  key_name: z.string().nullish(),
  key_prefix: z.string().nullish(),
});

function toBalance(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));

  return Number.isFinite(parsed) ? parsed : 0;
}

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
};

export class BatStoreClient {
  private readonly apiKey: string;

  constructor(apiKey: string | null) {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new BatStoreError("auth", "BatStore API key is not configured.");
    }

    this.apiKey = apiKey.trim();
  }

  private async request(path: string, options: RequestOptions = {}): Promise<{ status: number; json: unknown }> {
    const method = options.method ?? "GET";
    const route = sanitisePath(path);
    const startedAt = Date.now();
    let response: Response;

    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
          "X-Reseller-Key": this.apiKey,
          Accept: "application/json",
          ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "request failed";

      logFailure("provider.batstore", "provider_unreachable", error, {
        provider: "batstore",
        path: route,
        ms: Date.now() - startedAt,
      });

      throw new BatStoreError("network", `Could not reach BatStore API: ${reason}`);
    }

    const text = await response.text();
    let json: unknown = null;

    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 300) };
    }

    const ms = Date.now() - startedAt;

    if (response.ok) {
      log.debug("provider.batstore", "provider_call", {
        provider: "batstore",
        path: route,
        status: response.status,
        ms,
      });

      return { status: response.status, json };
    }

    const body = (json ?? {}) as { code?: unknown; message?: unknown; error?: unknown; raw?: unknown };
    const message =
      (typeof body.message === "string" && body.message) ||
      (typeof body.error === "string" && body.error) ||
      (typeof body.raw === "string" && body.raw) ||
      `BatStore API responded with HTTP ${response.status}`;

    const failure = classifyBatStoreStatus(response.status, message);

    log.warn("provider.batstore", "provider_call_failed", {
      provider: "batstore",
      path: route,
      status: response.status,
      ms,
      kind: failure.kind,
      code: typeof body.code === "string" ? body.code : null,
    });

    throw failure;
  }

  /**
   * Verify the key and read the wallet balance.
   *
   * The cheapest call BatStore documents, and the number an owner actually wants
   * to see next to a saved key.
   */
  async getMe(): Promise<BatStoreAccount> {
    const { json } = await this.request("/api/reseller/me");
    const parsed = meSchema.safeParse(json);

    if (!parsed.success) {
      throw new BatStoreError("contract", "BatStore API returned an unreadable account.");
    }

    const data = parsed.data;
    const username = data.username?.trim() || data.first_name?.trim() || String(data.user_telegram_id ?? "—");

    return {
      username,
      balance: toBalance(data.wallet_balance),
    };
  }

  /** Every sellable product, test products included — the importer decides. */
  async listProducts(): Promise<BatStoreProduct[]> {
    const { json } = await this.request("/api/reseller/products");
    const parsed = productsSchema.safeParse(json);

    if (!parsed.success) {
      throw new BatStoreError("contract", "BatStore API returned an unreadable product list.");
    }

    return parsed.data.map(toBatStoreProduct);
  }

  /**
   * Place an order.
   *
   * `idempotencyKey` must be stable per attempt — an order item id, not a fresh
   * UUID — because the provider treats it as the deduplication key and a new one
   * buys a second time.
   */
  async createOrder(input: {
    productId: string;
    quantity: number;
    activationIdentifier: string;
    idempotencyKey: string;
    customerReference?: string;
  }): Promise<BatStoreOrder> {
    const { json } = await this.request("/api/reseller/orders", {
      method: "POST",
      body: {
        product_id: input.productId,
        quantity: input.quantity,
        activation_identifier: input.activationIdentifier,
        idempotency_key: input.idempotencyKey,
        ...(input.customerReference ? { customer_reference: input.customerReference } : {}),
      },
    });

    const parsed = orderSchema.safeParse(json);

    if (!parsed.success) {
      throw new BatStoreError("contract", "BatStore API returned an unreadable order.");
    }

    return toBatStoreOrder(parsed.data);
  }

  /** Read one order, which is how delivery is checked after placing it. */
  async getOrder(orderId: string): Promise<BatStoreOrder> {
    const { json } = await this.request(`/api/reseller/orders/${encodeURIComponent(orderId)}`);
    const parsed = orderSchema.safeParse(json);

    if (!parsed.success) {
      throw new BatStoreError("contract", "BatStore API returned an unreadable order.");
    }

    return toBatStoreOrder(parsed.data);
  }
}