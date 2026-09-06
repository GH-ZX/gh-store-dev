import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { safeRedirectTarget } from "@server/lib/auth/redirect-target";
import { createSessionClient, withSessionCookies } from "@server/session";
import type { Route } from "./+types/auth-callback";

/**
 * OAuth return address. Supabase drops the user here with a PKCE code; the
 * session cookies land on the redirect home so the next render is signed in.
 * Kept outside the locale prefix like the legacy route: the provider
 * whitelists this exact URL, and a locale rewrite would break the exchange.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);

  const code = url.searchParams.get("code");
  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  }

  const localeParam = url.searchParams.get("locale") ?? "";
  const locale = isLocale(localeParam) ? localeParam : DEFAULT_LOCALE;
  const target = safeRedirectTarget(url.searchParams.get("next")) ?? `/${locale}`;
  return withSessionCookies(Response.redirect(target, 302), jar, isProduction);
}
