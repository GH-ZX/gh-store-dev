import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, getLocaleFromPathname } from "@/i18n/config";
import { getSupabaseEnv } from "@/lib/supabase/env";

// Cloudflare OpenNext currently requires the Edge middleware runtime.
// Next.js 16 renamed this convention to proxy, but proxy defaults to Node.js.
export async function middleware(request: NextRequest) {
  const locale = getLocaleFromPathname(request.nextUrl.pathname);

  if (!locale) {
    const localizedUrl = request.nextUrl.clone();
    localizedUrl.pathname = `/${DEFAULT_LOCALE}${request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname}`;
    return NextResponse.redirect(localizedUrl);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-gh-store-locale", locale);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  const { url, publishableKey } = getSupabaseEnv();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      },
    },
  });

  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: [
    /*
     * Metadata routes must be excluded explicitly: they are real routes, so
     * without this the locale redirect would rewrite /sitemap.xml to
     * /ar/sitemap.xml and hand crawlers a 404.
     */
    /*
     * `auth/callback` is excluded like `api`: Google lands the browser on it
     * with a code, and rewriting it into a locale prefix would break the
     * redirect URL whitelisted in Supabase.
     */
    "/((?!api|auth/callback|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
