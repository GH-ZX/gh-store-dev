import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { getStoreEnv, type StoreEnvVars } from "./env";

/**
 * Cookie attributes for Supabase session cookies written on the server.
 * Single source: every writer (loaders, actions) funnels through the jar
 * below, so login, refresh and sign-out agree. Secure follows the Worker
 * environment, not the build mode — dev runs plain HTTP where browsers
 * silently drop Secure cookies.
 */
export type SessionCookie = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

function serializeCookie(cookie: SessionCookie, isProduction: boolean): string {
  const attributes: Record<string, string | boolean> = {
    ...(cookie.options ?? {}),
    HttpOnly: true,
    SameSite: "Lax",
    Secure: isProduction,
    Path: "/",
  };
  let serialized = `${cookie.name}=${cookie.value}`;
  for (const [key, value] of Object.entries(attributes)) {
    if (value === false || value === undefined || value === null) continue;
    serialized += value === true ? `; ${key}` : `; ${key}=${String(value)}`;
  }
  return serialized;
}

export type CookieJar = {
  cookies: SessionCookie[];
};

/**
 * Supabase SSR client bound to one request. Reads the session from the
 * incoming Cookie header; collects every cookie the auth layer writes so the
 * loader/action can attach them to its own Response. No global state, no
 * React cache — one jar per request, passed explicitly.
 */
export function createSessionClient(request: Request, env?: StoreEnvVars) {
  const resolved = getStoreEnv(env);
  const jar: CookieJar = { cookies: [] };
  const incoming = request.headers.get("cookie") ?? "";

  const supabase = createServerClient(resolved.url, resolved.publishableKey, {
    cookies: {
      getAll() {
        return incoming
          .split(";")
          .map((part) => part.trim())
          .filter((part) => part.includes("="))
          .map((part) => {
            const index = part.indexOf("=");
            return { name: part.slice(0, index).trim(), value: part.slice(index + 1).trim() };
          });
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          jar.cookies.push({
            name: cookie.name,
            value: cookie.value,
            options: (cookie.options ?? {}) as Record<string, unknown>,
          });
        }
      },
    },
  });

  return { supabase, jar, isProduction: resolved.isProduction };
}

/**
 * Service-role client for the narrow writes/reads a customer session must not
 * author: invoice rows, alert queue inserts. Null when the key is absent —
 * callers degrade (no invoice) instead of throwing inside a page.
 */
export function createServiceClient(env?: StoreEnvVars) {
  const resolved = getStoreEnv(env);
  const secret = resolved.serviceRoleKey?.trim();
  if (!secret) {
    return null;
  }
  return createServiceClientInner(resolved.url, secret);
}

function createServiceClientInner(url: string, key: string) {
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Session user id, or null for visitors. Never throws for anonymous traffic. */
export async function getSessionUserId(
  client: Pick<Awaited<ReturnType<typeof createSessionClient>>["supabase"], "auth">,
): Promise<string | null> {
  const { data, error } = await client.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string" || !userId) return null;
  return userId;
}

/** Attach collected session cookies to an outgoing Response. */
export function withSessionCookies(response: Response, jar: CookieJar, isProduction: boolean): Response {
  for (const [name, value] of sessionCookieHeaders(jar, isProduction)) {
    response.headers.append(name, value);
  }
  return response;
}

/**
 * Cookie headers for React Router `data()` responses. Loaders must return
 * deserializable data — a raw `Response.json()` body never reaches
 * `useLoaderData` — so session refreshes ride along as headers instead.
 */
export function sessionCookieHeaders(
  jar: CookieJar,
  isProduction: boolean,
): [string, string][] {
  return jar.cookies.map(
    (cookie) => ["Set-Cookie", serializeCookie(cookie, isProduction)] as [string, string],
  );
}

/** JSON data response carrying any refreshed session cookies. */
export function jsonWithSession<T>(
  data: T,
  jar: CookieJar,
  isProduction: boolean,
  init?: ResponseInit,
): Response {
  const response = Response.json(data, init);
  return withSessionCookies(response, jar, isProduction);
}

 /** Send visitors to sign in, preserving their destination like the legacy guard. */
export function redirectToLogin(request: Request, locale: string, next: string): Response {
  const url = new URL(`/${locale}/login?next=${encodeURIComponent(next)}`, request.url);
  return Response.redirect(url, 302);
}
