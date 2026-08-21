import "server-only";

import { z } from "zod";
import { log, logFailure } from "@/lib/logging/logger";
import { sanitisePath } from "@/lib/logging/outcome";
import {
  classifyStatus,
  G2BulkAuthError,
  G2BulkContractError,
  G2BulkError,
} from "@/providers/g2bulk/errors";
import {
  gameCatalogueSchema,
  gameFieldsSchema,
  gamesSchema,
  gameServersSchema,
  getMeSchema,
  productsSchema,
  type G2BulkAccount,
  type G2BulkCatalogue,
  type G2BulkGame,
  type G2BulkGameFields,
  type G2BulkGameServers,
  type G2BulkProduct,
} from "@/providers/g2bulk/schemas";
import {
  checkPlayerSchema,
  gameOrderSchema,
  gameOrdersListSchema,
  voucherDeliverySchema,
  voucherPurchaseSchema,
  type G2BulkGameOrder,
} from "@/providers/g2bulk/fulfillment-schemas";

/**
 * G2Bulk main API client.
 *
 * `import "server-only"` makes it a build error for this module — and therefore
 * the API key — to reach a client bundle.
 *
 * Behaviour follows `docs/providers/g2bulk-api.md`:
 * - The key travels in `X-API-Key`, never in a query string or body.
 * - A 401 throws immediately and is never retried: the provider bans an IP that
 *   keeps presenting a bad key.
 * - 429 and 5xx are retried with bounded exponential backoff.
 * - Catalogue endpoints are public, but the key is still sent when present so
 *   account-scoped pricing (if any) applies consistently.
 */

const BASE_URL = "https://api.g2bulk.com/v1";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 400;

/** `POST /v1/games/servers` answers 403 when a game needs no server. */
const NO_SERVER_REQUIRED_STATUS = 403;

export type G2BulkClientOptions = {
  apiKey: string | null;
};

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  /** Statuses to hand back to the caller instead of throwing. */
  tolerate?: number[];
  /**
   * Whether this endpoint needs the API key. The catalogue endpoints are
   * documented as public, and a secret should not be sent where it earns
   * nothing.
   */
  auth?: boolean;
  /**
   * 36-character UUID sent as `X-Idempotency-Key`. The provider replays the
   * original response for 30 minutes, which is what makes retrying a purchase
   * safe. A key of any other length is rejected outright, so it is validated
   * before the request rather than after a charge.
   */
  idempotencyKey?: string;
};

type RawResponse = { status: number; json: unknown };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class G2BulkClient {
  protected readonly apiKey: string | null;

  constructor({ apiKey }: G2BulkClientOptions) {
    this.apiKey = apiKey?.trim() || null;
  }

  get hasKey(): boolean {
    return this.apiKey !== null;
  }

  protected async request(path: string, options: RequestOptions = {}): Promise<RawResponse> {
    const { method = "GET", body, tolerate = [], auth = false, idempotencyKey } = options;

    if (idempotencyKey !== undefined && idempotencyKey.length !== 36) {
      throw new G2BulkError("request", "An idempotency key must be exactly 36 characters.");
    }
    let lastError: G2BulkError | null = null;

    // Every G2Bulk call comes through here, retries included. The path carries
    // game codes and order ids, so it is grouped rather than logged raw.
    const route = sanitisePath(path);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const startedAt = Date.now();
      const headers: Record<string, string> = { Accept: "application/json" };

      if (auth && this.apiKey) {
        headers["X-API-Key"] = this.apiKey;
      }

      if (idempotencyKey) {
        headers["X-Idempotency-Key"] = idempotencyKey;
      }

      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
      }

      let response: Response;

      try {
        response = await fetch(`${BASE_URL}${path}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          cache: "no-store",
        });
      } catch (error) {
        lastError = new G2BulkError(
          "network",
          error instanceof Error ? error.message : "Network request failed",
        );

        if (attempt === MAX_ATTEMPTS) {
          logFailure("provider.g2bulk", "provider_unreachable", error, {
            provider: "g2bulk",
            method,
            path: route,
            attempt,
            ms: Date.now() - startedAt,
          });

          throw lastError;
        }

        /*
         * The retry itself is worth a line. A supplier degrading into "slow but
         * eventually fine" succeeds from the caller's point of view and leaves
         * no other trace, which is precisely when it is worth knowing.
         */
        log.warn("provider.g2bulk", "provider_retry", {
          provider: "g2bulk",
          method,
          path: route,
          attempt,
          ms: Date.now() - startedAt,
          kind: "network",
        });

        await delay(BACKOFF_BASE_MS * attempt);
        continue;
      }

      const text = await response.text();
      let json: unknown = null;

      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
      }

      const ms = Date.now() - startedAt;

      if (tolerate.includes(response.status) || response.ok) {
        // Debug for the same reason as Sam: a healthy call at info would bury
        // the stream. `minLevel` on the Providers page turns this on.
        log.debug("provider.g2bulk", "provider_call", {
          provider: "g2bulk",
          method,
          path: route,
          status: response.status,
          attempt,
          ms,
        });

        return { status: response.status, json };
      }

      const message = messageFrom(json) ?? `G2Bulk responded ${response.status}`;
      const error = classifyStatus(response.status, message);

      // Never retry an auth failure: repeated 401s get the IP banned.
      if (!error.retryable || attempt === MAX_ATTEMPTS) {
        log.error("provider.g2bulk", "provider_call_failed", {
          provider: "g2bulk",
          method,
          path: route,
          status: response.status,
          attempt,
          ms,
          kind: error.kind,
          retryable: error.retryable,
        });

        throw error;
      }

      log.warn("provider.g2bulk", "provider_retry", {
        provider: "g2bulk",
        method,
        path: route,
        status: response.status,
        attempt,
        ms,
        kind: error.kind,
      });

      lastError = error;
      await delay(BACKOFF_BASE_MS * 2 ** (attempt - 1));
    }

    throw lastError ?? new G2BulkError("network", "G2Bulk request failed");
  }

  /** POST to a documented public endpoint (no key). */
  protected async publicRequest(path: string, body: unknown): Promise<RawResponse> {
    return this.request(path, { method: "POST", body });
  }

  /** POST to an authenticated endpoint that spends money. */
  protected async authorizedRequest(
    path: string,
    body: unknown,
    idempotencyKey: string,
  ): Promise<RawResponse> {
    if (!this.apiKey) {
      throw new G2BulkAuthError("No G2Bulk API key is configured.");
    }

    return this.request(path, { method: "POST", body, auth: true, idempotencyKey });
  }

  private async parse<T>(schema: z.ZodType<T>, path: string, json: unknown): Promise<T> {
    const parsed = schema.safeParse(json);

    if (!parsed.success) {
      throw new G2BulkContractError(
        `G2Bulk ${path} returned an unexpected shape: ${parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join(".") || "root"} ${issue.message}`)
          .join("; ")}`,
      );
    }

    return parsed.data;
  }

  /** Verify the key and read the supplier wallet balance. */
  async getAccount(): Promise<G2BulkAccount> {
    if (!this.apiKey) {
      throw new G2BulkAuthError("No G2Bulk API key is configured.");
    }

    const { json } = await this.request("/getMe", { auth: true });

    return this.parse(getMeSchema, "/getMe", json);
  }

  async listGames(): Promise<G2BulkGame[]> {
    const { json } = await this.request("/games");
    const parsed = await this.parse(gamesSchema, "/games", json);

    return parsed.games;
  }

  async getGameCatalogue(code: string): Promise<G2BulkCatalogue> {
    const { json } = await this.request(`/games/${encodeURIComponent(code)}/catalogue`);

    return this.parse(gameCatalogueSchema, "/games/:code/catalogue", json);
  }

  async getGameFields(code: string): Promise<G2BulkGameFields> {
    const { json } = await this.request("/games/fields", { method: "POST", body: { game: code } });

    return this.parse(gameFieldsSchema, "/games/fields", json);
  }

  /**
   * Server list for a game, or `null` when the game needs no server.
   *
   * The provider signals "no server required" with a 403 on this endpoint, which
   * is documented as an expected answer rather than a failure.
   */
  async getGameServers(code: string): Promise<G2BulkGameServers | null> {
    const { status, json } = await this.request("/games/servers", {
      method: "POST",
      body: { game: code },
      tolerate: [NO_SERVER_REQUIRED_STATUS],
    });

    if (status === NO_SERVER_REQUIRED_STATUS) {
      return null;
    }

    const parsed = gameServersSchema.safeParse(json);

    // Some games answer 200 with no usable server map; treat that as "none"
    // rather than failing an import over an optional field.
    return parsed.success ? parsed.data : null;
  }

  async listProducts(): Promise<G2BulkProduct[]> {
    const { json } = await this.request("/products");
    const parsed = await this.parse(productsSchema, "/products", json);

    return parsed.products;
  }
}

function messageFrom(json: unknown): string | null {
  if (!json || typeof json !== "object") {
    return null;
  }

  const message = (json as { message?: unknown }).message;

  return typeof message === "string" && message.trim() ? message.trim() : null;
}

/**
 * Fulfilment calls.
 *
 * Kept separate from the catalogue reads above because these spend money. Each
 * one requires the API key, and the two purchase calls carry a 36-character
 * `X-Idempotency-Key` — the provider honours it for 30 minutes, which is what
 * makes a retry safe.
 */
export class G2BulkFulfillmentClient extends G2BulkClient {
  /** Validate a player before charging. A missing `valid` marker means invalid. */
  async checkPlayer(input: {
    game: string;
    userId: string;
    serverId?: string;
    charname?: string;
  }): Promise<{ valid: boolean; name: string | null }> {
    const { json } = await this.publicRequest("/games/checkPlayerId", {
      game: input.game,
      user_id: input.userId,
      ...(input.serverId ? { server_id: input.serverId } : {}),
      ...(input.charname ? { charname: input.charname } : {}),
    });

    const parsed = checkPlayerSchema.safeParse(json);

    if (!parsed.success) {
      return { valid: false, name: null };
    }

    return {
      valid: parsed.data.valid?.trim().toLowerCase() === "valid",
      name: parsed.data.name ?? null,
    };
  }

  async placeGameOrder(
    code: string,
    body: {
      catalogue_name: string;
      player_id: string;
      server_id?: string;
      charname?: string;
      remark?: string;
      callback_url?: string;
    },
    idempotencyKey: string,
  ): Promise<G2BulkGameOrder> {
    const { json } = await this.authorizedRequest(
      `/games/${encodeURIComponent(code)}/order`,
      body,
      idempotencyKey,
    );
    const parsed = gameOrderSchema.safeParse(json);

    if (!parsed.success) {
      throw new G2BulkContractError(
        `G2Bulk /games/:code/order returned an unexpected shape: ${parsed.error.issues[0]?.message}`,
      );
    }

    return parsed.data;
  }

  /**
   * Current state of one of our top-up orders.
   *
   * Read from the documented order list rather than the status endpoint, whose
   * request and response the contract does not specify — and guessing a provider
   * payload is exactly how a "delivered" is misread.
   */
  async findGameOrderStatus(externalOrderId: string): Promise<{ status: string; refunded: boolean } | null> {
    const { json } = await this.request("/games/orders?page=1&limit=100", { auth: true });
    const parsed = gameOrdersListSchema.safeParse(json);

    if (!parsed.success) {
      throw new G2BulkContractError("G2Bulk /games/orders returned an unexpected shape");
    }

    const match = parsed.data.orders.find(
      (order) => String(order.order_id) === String(externalOrderId),
    );

    if (!match) {
      return null;
    }

    return { status: match.status, refunded: match.is_refunded === true };
  }

  async purchaseVoucher(
    productId: string,
    quantity: number,
    idempotencyKey: string,
  ): Promise<z.infer<typeof voucherPurchaseSchema>> {
    const { json } = await this.authorizedRequest(
      `/products/${encodeURIComponent(productId)}/purchase`,
      { quantity },
      idempotencyKey,
    );
    const parsed = voucherPurchaseSchema.safeParse(json);

    if (!parsed.success) {
      throw new G2BulkContractError("G2Bulk purchase returned an unexpected shape");
    }

    return parsed.data;
  }

  /**
   * Poll a pending voucher order.
   *
   * The documented codes carry the meaning: 200 delivered, 202 still processing,
   * 410 terminal failure already refunded by the provider, 404 not ours.
   */
  async pollVoucherDelivery(
    externalOrderId: string,
  ): Promise<{ state: "delivered" | "processing" | "failed" | "missing"; items: string[] }> {
    const { status, json } = await this.request(
      `/orders/${encodeURIComponent(externalOrderId)}/delivery`,
      { auth: true, tolerate: [202, 404, 410] },
    );

    if (status === 202) {
      return { state: "processing", items: [] };
    }

    if (status === 410) {
      return { state: "failed", items: [] };
    }

    if (status === 404) {
      return { state: "missing", items: [] };
    }

    const parsed = voucherDeliverySchema.safeParse(json);
    const items = parsed.success ? parsed.data.delivery_items : null;

    // A 200 without at least one delivery item is not a usable delivery. Treating
    // it as completed would leave the customer charged with no code to receive.
    if (!items || items.length === 0) {
      throw new G2BulkContractError(
        "G2Bulk delivery returned success without delivery items.",
      );
    }

    return { state: "delivered", items };
  }
}
