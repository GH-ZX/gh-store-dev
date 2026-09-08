import "server-only";

import { z } from "zod";
import { log, logFailure } from "@/lib/logging/logger";

/**
 * IGDB (Twitch) artwork client.
 *
 * `import "server-only"` makes it a build error for this module — and therefore
 * the client secret — to reach a browser bundle. IGDB refuses browser origins
 * outright (CORS), so server-side was never a choice to begin with.
 *
 * Contract notes from `docs/providers/igdb-api.md`:
 *
 * - A token comes from Twitch's OAuth `client_credentials` grant and outlives
 *   any single search by weeks, so it is cached in module scope until shortly
 *   before its own expiry rather than fetched per call.
 * - The query language is Apicalypse — a plain text body, not JSON.
 * - The rate limit is 4 requests per second. This store's searches are a human
 *   typing a game name and pressing a button, which cannot reach that ceiling,
 *   so a 429 is retried once after a pause instead of building machinery for a
 *   load the store can never produce.
 */

const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const API_BASE_URL = "https://api.igdb.com/v4";
const REQUEST_TIMEOUT_MS = 15_000;

export type IgdbErrorKind = "auth" | "rate_limit" | "network" | "contract" | "request";

export class IgdbError extends Error {
  readonly kind: IgdbErrorKind;
  readonly status: number | null;

  constructor(kind: IgdbErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = "IgdbError";
    this.kind = kind;
    this.status = status;
  }
}

export type IgdbArtwork = {
  name: string;
  /** Cover sized for catalog cards (`t_cover_big`). */
  coverUrl: string | null;
  /** Grid thumbnail (`t_thumb`), what the picker itself renders. */
  thumbUrl: string | null;
  /** First official artwork at hero size, when the game has one. */
  artworkUrl: string | null;
};

/** The documented CDN pattern; sizes are named transforms on one image id. */
export function igdbImageUrl(imageId: string, size: string): string {
  return `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg`;
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.coerce.number(),
});

const gameSchema = z.object({
  name: z.string(),
  cover: z.object({ image_id: z.string() }).nullish(),
  artworks: z.array(z.object({ image_id: z.string() })).nullish(),
});

const gamesSchema = z.array(gameSchema);

type CachedToken = { value: string; expiresAt: number };

let cachedToken: CachedToken | null = null;
let cachedKey: string | null = null;

function invalidateToken(): void {
  cachedToken = null;
}

async function fetchToken(clientId: string, clientSecret: string): Promise<string> {
  const cacheKey = `${clientId}:${clientSecret}`;

  if (cachedToken && cachedKey === cacheKey && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }

  let response: Response;

  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    logFailure("provider.igdb", "provider_unreachable", error, { provider: "igdb", path: "token" });

    throw new IgdbError("network", "Could not reach Twitch to authorize IGDB.");
  }

  if (response.status === 401 || response.status === 403) {
    throw new IgdbError("auth", "Twitch rejected the IGDB credentials.", response.status);
  }

  const json = (await response.json().catch(() => null)) as unknown;
  const parsed = tokenResponseSchema.safeParse(json);

  if (!response.ok || !parsed.success) {
    throw new IgdbError("auth", "Twitch did not return an IGDB token.", response.status);
  }

  // Renew five minutes early, so a token dying mid-request stays theoretical.
  cachedToken = {
    value: parsed.data.access_token,
    expiresAt: Date.now() + Math.max(60_000, (parsed.data.expires_in - 300) * 1000),
  };
  cachedKey = cacheKey;

  return cachedToken.value;
}

export class IgdbClient {
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(credentials: { clientId: string; clientSecret: string }) {
    this.clientId = credentials.clientId;
    this.clientSecret = credentials.clientSecret;
  }

  /**
   * Search games by name, with the artwork this store renders.
   *
   * `version_parent = null` drops regional re-releases and beta forks of the
   * same game, which otherwise crowd a search for a popular title.
   */
  async searchGames(query: string): Promise<IgdbArtwork[]> {
    const trimmed = query.trim().slice(0, 80);

    if (!trimmed) {
      return [];
    }

    const token = await fetchToken(this.clientId, this.clientSecret);

    return this.searchOnce(token, trimmed);
  }

  private async searchOnce(token: string, query: string, attempt = 1): Promise<IgdbArtwork[]> {
    const startedAt = Date.now();
    let response: Response;

    try {
      response = await fetch(`${API_BASE_URL}/games`, {
        method: "POST",
        headers: {
          "Client-ID": this.clientId,
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        body: [
          `search "${query.replace(/"/g, "")}";`,
          "fields name,cover.image_id,artworks.image_id;",
          "where version_parent = null;",
          "limit 8;",
        ].join(" "),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (error) {
      logFailure("provider.igdb", "provider_unreachable", error, {
        provider: "igdb",
        path: "/games",
        ms: Date.now() - startedAt,
      });

      throw new IgdbError("network", "Could not reach IGDB.");
    }

    // One polite retry, then give up: the limit exists to protect IGDB, not us.
    if (response.status === 429 && attempt === 1) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      invalidateToken();

      return this.searchOnce(await fetchToken(this.clientId, this.clientSecret), query, attempt + 1);
    }

    const text = await response.text();
    let json: unknown = null;

    try {
      json = text ? JSON.parse(text) : [];
    } catch {
      json = null;
    }

    if (response.status === 401 || response.status === 403) {
      throw new IgdbError("auth", "IGDB rejected the store's credentials.", response.status);
    }

    if (!response.ok) {
      throw new IgdbError(
        response.status === 429 ? "rate_limit" : "request",
        "IGDB refused the search.",
        response.status,
      );
    }

    const parsed = gamesSchema.safeParse(json ?? []);

    if (!parsed.success) {
      throw new IgdbError("contract", "IGDB returned an unreadable search result.");
    }

    log.debug("provider.igdb", "provider_call", {
      provider: "igdb",
      path: "/games",
      status: response.status,
      ms: Date.now() - startedAt,
    });

    return parsed.data.map((game) => ({
      name: game.name,
      coverUrl: game.cover?.image_id ? igdbImageUrl(game.cover.image_id, "cover_big") : null,
      thumbUrl: game.cover?.image_id ? igdbImageUrl(game.cover.image_id, "thumb") : null,
      artworkUrl:
        game.artworks && game.artworks.length > 0
          ? igdbImageUrl(game.artworks[0]!.image_id, "1080p")
          : null,
    }));
  }
}
