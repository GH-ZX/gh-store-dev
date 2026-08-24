import type { CookieOptions } from "@supabase/ssr";

/**
 * Cookie attributes for Supabase session cookies written on the server.
 *
 * Without these the auth-token cookie carries the full session — access token,
 * refresh token, user object — readable by any script on the page and sent
 * over plain HTTP if TLS were ever bypassed. HttpOnly closes the script route,
 * Secure closes the plaintext route, SameSite=Lax keeps the cookie on
 * top-level navigations only.
 *
 * Secure depends on environment: production answers over HTTPS only, but the
 * dev server runs plain HTTP, where browsers silently drop Secure cookies and
 * every local sign-in would stop working. The refresh flow rewrites these
 * cookies from middleware on nearly every request, so both writers must agree
 * — keep this module as the single source of the attributes.
 */
export function hardenSessionCookieOptions(options: CookieOptions): CookieOptions {
  return {
    ...options,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  };
}
