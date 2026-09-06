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
