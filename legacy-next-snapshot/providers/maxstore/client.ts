import "server-only";

import { log, logFailure } from "@/lib/logging/logger";
import { sanitisePath } from "@/lib/logging/outcome";
import {
  classifyMaxStoreCode,
  classifyMaxStoreStatus,
  MaxStoreAuthError,
  MaxStoreContractError,
  MaxStoreError,
} from "@/providers/maxstore/errors";
import {
  checkSchema,
  orderSchema,
  productsSchema,
  profileSchema,
  readAvailable,
  readProductCategory,
  readProductImage,
  readStockCount,
  type MaxStoreProduct,
  type MaxStoreProfile,
} from "@/providers/maxstore/schemas";

/**
 * MaxStore API client.
 *
 * `import "server-only"` makes it a build error for this module — and therefore
 * the API token — to reach a client bundle.
 *
 * Behaviour follows `docs/providers/maxstore-api.md`, amended where live
 * imports have shown the real payloads to differ. That is also why every read
 * goes through a permissive schema and why the verify call exists: any endpoint
 * whose first real response has not been seen yet is treated as unproven.
 *
 * Shaped like the G2Bulk client on purpose. Two suppliers that behave the same
 * way under failure are two suppliers an operator only has to learn once:
 *
 * - The token travels in the `api-token` header, never in a query string.
 * - An auth failure throws immediately and is never retried; MaxStore blocks an
 *   IP (code 123), so a retry loop against a bad token is how a store loses its
 *   supplier entirely.
 * - 429 and 5xx back off and retry, honouring `Retry-After` when it is sent —
 *   the documented limit is 60 calls a minute, and 30 for orders.
 */

const BASE_URL = "https://maxstore1.com";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 400;

/** Cap on a server-suggested wait, so one long `Retry-After` cannot hang a request. */
const MAX_RETRY_AFTER_MS = 5_000;

export type MaxStoreClientOptions = {
  apiToken: string;
};

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `Retry-After` in seconds, bounded, or null when absent or nonsense. */
function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");

  if (!header) {
    return null;
  }

  const seconds = Number.parseFloat(header);

  return Number.isFinite(seconds) && seconds >= 0
    ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS)
    : null;
}

/**
 * Turn a failed response into the right error.
 *
 * The body's `detail.code` is preferred over the status because it is the more
 * precise of the two: an HTTP 400 covers a missing field, a deleted product,
 * and an empty wallet, and those are not the same news for the person waiting.
 */
function toError(status: number, body: unknown): MaxStoreError {
  const detail =
    body && typeof body === "object" ? (body as { detail?: unknown }).detail : undefined;

  if (detail && typeof detail === "object") {
    const { code, message } = detail as { code?: unknown; message?: unknown };
    const text = typeof message === "string" && message.trim() ? message.trim() : "MaxStore refused the request.";

    if (typeof code === "number") {
      return classifyMaxStoreCode(code, text, status);
    }

    return classifyMaxStoreStatus(status, text);
  }

  return classifyMaxStoreStatus(status, `MaxStore answered ${status}.`);
}

export class MaxStoreClient {
  private readonly apiToken: string;

  constructor(options: MaxStoreClientOptions) {
    this.apiToken = options.apiToken;
  }

  private async request(path: string, options: RequestOptions = {}): Promise<unknown> {
    const method = options.method ?? "GET";
    // The path carries product and order ids, so it is grouped before logging.
    const route = sanitisePath(path);

    // Order creation is idempotent at MaxStore via `order_uuid`, but a network
    // timeout leaves the result unknown. Do not repeat a spending POST from this
    // client: fulfillment records the ambiguous attempt and reconciliation checks
    // the existing order instead.
    const attempts = method === "POST" && path === "/api/v2/order" ? 1 : MAX_ATTEMPTS;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const startedAt = Date.now();
      let response: Response;

      try {
        response = await fetch(`${BASE_URL}${path}`, {
          method,
          headers: {
            "api-token": this.apiToken,
            accept: "application/json",
            ...(options.body === undefined ? {} : { "content-type": "application/json" }),
          },
          ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          cache: "no-store",
        });
      } catch (error) {
        if (attempt === attempts) {
          logFailure("provider.maxstore", "provider_unreachable", error, {
            provider: "maxstore",
            method,
            path: route,
            attempt,
            ms: Date.now() - startedAt,
          });

          throw new MaxStoreError("network", "MaxStore could not be reached.");
        }

        log.warn("provider.maxstore", "provider_retry", {
          provider: "maxstore",
          method,
          path: route,
          attempt,
          ms: Date.now() - startedAt,
          kind: "network",
        });

        await delay(BACKOFF_BASE_MS * attempt);
        continue;
      }

      const ms = Date.now() - startedAt;
      const text = await response.text();
      let json: unknown = null;

      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        // A non-JSON body is a contract problem, reported below with the status.
        json = null;
      }

      if (response.ok) {
        // Debug, like the other supplier: a healthy call at info would bury the
        // stream that matters.
        log.debug("provider.maxstore", "provider_call", {
          provider: "maxstore",
          method,
          path: route,
          status: response.status,
          attempt,
          ms,
        });

        if (json === null) {
          throw new MaxStoreContractError(`MaxStore ${route} returned a body that is not JSON.`);
        }

        return json;
      }

      const error = toError(response.status, json);

      /*
       * An auth failure is final and loud. Everything else retryable waits —
       * for the server's own suggested interval where it gave one, since a
       * provider that says when to come back knows better than a fixed curve.
       */
      if (error instanceof MaxStoreAuthError || !error.retryable || attempt === attempts) {
        log.error("provider.maxstore", "provider_call_failed", {
          provider: "maxstore",
          method,
          path: route,
          status: response.status,
          code: error.code,
          kind: error.kind,
          attempt,
          ms,
        });

        throw error;
      }

      log.warn("provider.maxstore", "provider_retry", {
        provider: "maxstore",
        method,
        path: route,
        status: response.status,
        code: error.code,
        attempt,
        ms,
        kind: error.kind,
      });

      await delay(retryAfterMs(response) ?? BACKOFF_BASE_MS * attempt);
    }

    throw new MaxStoreError("network", "MaxStore could not be reached.");
  }

  /** Balance and account, and the cheapest proof that a token works. */
  async getProfile(): Promise<MaxStoreProfile> {
    const parsed = profileSchema.safeParse(await this.request("/api/v2/profile"));

    if (!parsed.success) {
      throw new MaxStoreContractError("MaxStore /profile returned an unexpected shape.");
    }

    return {
      balance: parsed.data.balance ?? 0,
      userId: parsed.data.user_id ?? null,
      username: parsed.data.username ?? null,
    };
  }

  /** Every product, or the subset named. */
  async listProducts(productIds: string[] = []): Promise<MaxStoreProduct[]> {
    const query = productIds.length > 0 ? `?products_id=${encodeURIComponent(productIds.join(","))}` : "";
    const parsed = productsSchema.safeParse(await this.request(`/api/v2/products${query}`));

    if (!parsed.success) {
      throw new MaxStoreContractError("MaxStore /products returned an unexpected shape.");
    }

    return parsed.data.map((product) => {
      const category = readProductCategory(product);

      return {
        id: product.id,
        name: product.name ?? product.title ?? product.product_name ?? product.id,
        price: product.price ?? 0,
        categoryId: category.id,
        categoryTitle: category.title,
        available: readAvailable(product.available),
        productType: product.product_type ?? null,
        // Documented: a package is always bought one at a time.
        quantityFixed: (product.product_type ?? "").toLowerCase() === "package",
        qtyValues: product.qty_values ?? null,
        params: product.params ?? null,
        paramsMeta: product.params_meta ?? null,
        stockCount: readStockCount(product),
        imageUrl: readProductImage(product),
      };
    });
  }

  /**
   * Categories, or one category's contents.
   *
   * The response shape is undocumented, so it is handed back raw. A caller that
   * needs to read it has to look at a real response first — which is the whole
   * reason this returns `unknown` rather than a comfortable lie.
   */
  async getContent(categoryId: string | number = 0): Promise<unknown> {
    return this.request(`/api/v2/content/${encodeURIComponent(String(categoryId))}`);
  }

  /**
   * Place an order.
   *
   * `orderUuid` must be derived from something stable — an order item id, not a
   * fresh UUID per attempt — because it is the provider's idempotency key and a
   * new one buys a second time.
   */
  async placeOrder(input: {
    productId: string;
    quantity: number;
    orderUuid: string;
    params?: Record<string, unknown>;
  }): Promise<{ orderId: string | null; status: string | null; price: number | null }> {
    const parsed = orderSchema.safeParse(
      await this.request("/api/v2/order", {
        method: "POST",
        body: {
          product_id: input.productId,
          qty: input.quantity,
          order_uuid: input.orderUuid,
          ...(input.params && Object.keys(input.params).length > 0 ? { params: input.params } : {}),
        },
      }),
    );

    if (!parsed.success) {
      throw new MaxStoreContractError("MaxStore /order returned an unexpected shape.");
    }

    return {
      orderId: parsed.data.data?.order_id ?? null,
      status: parsed.data.data?.status ?? null,
      price: parsed.data.data?.price ?? null,
    };
  }

  /** How a batch of orders turned out. Up to 50 per call, per the documentation. */
  async checkOrders(orderUuids: string[]): Promise<
    { orderId: string | null; status: string | null; delivery: unknown }[]
  > {
    if (orderUuids.length === 0) {
      return [];
    }

    const query = encodeURIComponent(orderUuids.slice(0, 50).join(","));
    const parsed = checkSchema.safeParse(await this.request(`/api/v2/check?orders=${query}`));

    if (!parsed.success) {
      throw new MaxStoreContractError("MaxStore /check returned an unexpected shape.");
    }

    return (parsed.data.data ?? []).map((row) => ({
      orderId: row.order_id ?? null,
      status: row.status ?? null,
      delivery: row.delivery ?? null,
    }));
  }
}
