import "server-only";

import { z } from "zod";
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
};

type RawResponse = { status: number; json: unknown };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class G2BulkClient {
  private readonly apiKey: string | null;

  constructor({ apiKey }: G2BulkClientOptions) {
    this.apiKey = apiKey?.trim() || null;
  }

  get hasKey(): boolean {
    return this.apiKey !== null;
  }

  private async request(path: string, options: RequestOptions = {}): Promise<RawResponse> {
    const { method = "GET", body, tolerate = [], auth = false } = options;
    let lastError: G2BulkError | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const headers: Record<string, string> = { Accept: "application/json" };

      if (auth && this.apiKey) {
        headers["X-API-Key"] = this.apiKey;
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
          throw lastError;
        }

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

      if (tolerate.includes(response.status)) {
        return { status: response.status, json };
      }

      if (response.ok) {
        return { status: response.status, json };
      }

      const message = messageFrom(json) ?? `G2Bulk responded ${response.status}`;
      const error = classifyStatus(response.status, message);

      // Never retry an auth failure: repeated 401s get the IP banned.
      if (!error.retryable || attempt === MAX_ATTEMPTS) {
        throw error;
      }

      lastError = error;
      await delay(BACKOFF_BASE_MS * 2 ** (attempt - 1));
    }

    throw lastError ?? new G2BulkError("network", "G2Bulk request failed");
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
