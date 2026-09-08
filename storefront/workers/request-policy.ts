/** Consolidate the configured production www alias without redirecting previews. */
export function canonicalHostRedirect(request: Request, appUrl?: string): URL | null {
  if (!appUrl || !["GET", "HEAD"].includes(request.method)) return null;
  let canonical: URL;
  try {
    canonical = new URL(appUrl);
  } catch {
    return null;
  }
  const url = new URL(request.url);
  if (canonical.protocol !== "https:" || url.hostname !== `www.${canonical.hostname}`) return null;
  // Callback URLs and authenticated mutations keep their configured origin.
  if (/^\/(api|auth)(\/|$)/.test(url.pathname) || url.pathname.endsWith(".data")) return null;
  url.protocol = canonical.protocol;
  url.host = canonical.host;
  return url;
}

/** Preserve bookmarks from the original singular product URL convention. */
export function legacyProductRedirect(request: Request): URL | null {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/(?:(ar|en)\/)?game\/([^/]+)(?:\/([^/]+))?\/?$/);
  if (!match) return null;
  url.pathname = `/${match[1] ?? "ar"}/games/${match[2]}${match[3] ? `/${match[3]}` : ""}`;
  return url;
}

/** Only public document routes can be shared between anonymous visitors. */
export function isPublicHtmlRequest(request: Request): boolean {
  if (request.method !== "GET" || request.headers.has("cookie") || !request.headers.get("accept")?.includes("text/html")) return false;
  const { pathname } = new URL(request.url);
  if (!/^\/(ar|en)(\/|$)/.test(pathname) || pathname.endsWith(".data")) return false;
  return !/^\/(ar|en)\/(login|forgot-password|reset-password|profile|wallet|orders|checkout|recharge|notifications|support|dashboard|search|telegram-connect)(\/|$)/.test(pathname);
}

export function isCacheableHtml(response: Response): boolean {
  return response.status === 200 && !!response.headers.get("content-type")?.includes("text/html") &&
    !response.headers.has("set-cookie") && !/private|no-store|no-cache/i.test(response.headers.get("cache-control") ?? "");
}

/** Restore the same-origin boundary previously provided by server actions. */
export function isCrossOriginMutation(request: Request): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return false;
  const origin = request.headers.get("origin");
  return request.headers.get("sec-fetch-site") === "cross-site" || (origin !== null && origin !== new URL(request.url).origin);
}

export type CachePolicy = {
  ttlSeconds: number;
  tags: string[];
};

/** Resolve cache TTL and cache tags based on route tier. */
export function resolveCachePolicy(request: Request): CachePolicy {
  const url = new URL(request.url);
  const path = url.pathname;

  // 1. Specific product page: /(ar|en)/:category/:slug -> 1 hour TTL
  const productMatch = path.match(/^\/(?:ar|en)\/([^/]+)\/([^/]+)\/?$/);
  if (
    productMatch &&
    !["products", "games", "gift-cards", "sale", "search", "checkout", "orders", "recharge"].includes(
      productMatch[1],
    )
  ) {
    const category = productMatch[1];
    const slug = productMatch[2];
    return {
      ttlSeconds: 3600,
      tags: ["catalog", `category-${category}`, `product-${slug}`],
    };
  }

  // 2. Category listing page: /(ar|en)/:category -> 5 minutes TTL
  const categoryMatch = path.match(/^\/(?:ar|en)\/([^/]+)\/?$/);
  if (
    categoryMatch &&
    !["login", "dashboard", "wallet", "orders", "profile"].includes(categoryMatch[1])
  ) {
    return {
      ttlSeconds: 300,
      tags: ["catalog", `category-${categoryMatch[1]}`],
    };
  }

  // 3. Homepage and root -> 1 minute TTL
  return {
    ttlSeconds: 60,
    tags: ["home", "catalog"],
  };
}

/** Purge edge cache for a product and its parent category across both locales. */
export async function purgeEdgeCacheForProduct(
  originUrl: string,
  categorySlug: string,
  productSlug: string,
): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const cacheStore = caches as unknown as { default: Cache };
    const cache = cacheStore.default;
    const origin = new URL(originUrl).origin;
    const paths = [
      `/ar/${categorySlug}/${productSlug}`,
      `/en/${categorySlug}/${productSlug}`,
      `/ar/${categorySlug}`,
      `/en/${categorySlug}`,
      `/ar/products`,
      `/en/products`,
      `/ar`,
      `/en`,
    ];
    await Promise.all(
      paths.map((p) => cache.delete(new Request(`${origin}${p}`)).catch(() => false)),
    );
  } catch {
    // Non-blocking cache cleanup
  }
}
