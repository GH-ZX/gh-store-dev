/**
 * Which remote hosts the storefront's image proxy will fetch from.
 *
 * The proxy exists so a slow supplier host never sits on the critical path of a
 * page render. It is not a general-purpose fetcher: a request that names any
 * public host turns the Worker into an open image proxy, and every such request
 * costs an edge invocation and an origin fetch. The allow-list below is the
 * inventory of hosts the live catalog actually uses for `image_url`,
 * `logo_url` and `thumbnail_url`, plus the ones the store publishes for its own
 * brand marks.
 *
 * Rules:
 * - A host that is not listed is refused with 403 before any fetch happens.
 * - Removing a host from the catalog must not silently break a page: a listed
 *   host can disappear later without an outage, and an unlisted host is a bug
 *   that fails loudly in the proxy instead of quietly at the browser.
 * - The store's own origin is allowed so local brand assets can ride the same
 *   resize path, and because Supabase Storage is fronted by its own CDN the
 *   client never routes storage URLs through here.
 *
 * Deliberately absent, with the date each was removed:
 * - `www.google.com` — the `/s2/favicons` endpoint is an undocumented Google
 *   service, not a brand-art CDN; it may rate-limit, change shape, or block
 *   hotlinking at any time. Migration `20261010060000` clears the products that
 *   depended on it (see `docs/store-upgrade/` notes for the owner list).
 * - `images.g2a.com` — a competitor's CDN. Hotlinking it advertises a
 *   competitor and can be withdrawn without notice. Migration
 *   `20261010060000` clears the one product that used it.
 */

/** Hosts the live storefront serves artwork from, lower-cased, no port. */
const ALLOWED_MEDIA_HOSTS: readonly string[] = [
  // Store-owned and store-published assets.
  "gh-store.me",
  "www.gh-store.me",
  // Supplier and catalog-content hosts.
  "api.g2bulk.com",
  "static.driffle.com",
  "cdn.hesap.com.tr",
  "minio.roboticvn.com",
  "i.postimg.cc",
  "cdn.prod.website-files.com",
  // Brand-mark CDNs. Small vector/PNG marks, already cached by their own edge.
  "cdn.jsdelivr.net",
  "cdn.simpleicons.org",
  "play-lh.googleusercontent.com",
];

const ALLOWED_MEDIA_HOST_SET = new Set(ALLOWED_MEDIA_HOSTS);

/** Hosts known to be in use in the catalog but not acceptable long term. */
export const BLOCKED_MEDIA_HOSTS: readonly string[] = [
  "www.google.com",
  "images.g2a.com",
];

export function isAllowedMediaHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) return false;
  if (ALLOWED_MEDIA_HOST_SET.has(host)) return true;
  // Subdomain use of a listed host is the same supplier and the same policy.
  for (const allowed of ALLOWED_MEDIA_HOSTS) {
    if (host.endsWith(`.${allowed}`)) return true;
  }
  return false;
}

/**
 * A full-URL check for the proxy: protocol is judged by the caller, host and
 * path shape here. Only images are worth proxying, and only over http(s).
 */
export function isProxyableMediaUrl(url: URL): boolean {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.username || url.password) return false;
  if (!isAllowedMediaHost(url.hostname)) return false;
  // `data:`/`blob:` never reach here, and a bare origin is not an image.
  return url.pathname !== "" && url.pathname !== "/";
}

export const MEDIA_HOST_ALLOWLIST = ALLOWED_MEDIA_HOSTS;
