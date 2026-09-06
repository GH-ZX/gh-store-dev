import { redirect } from "react-router";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { safeRedirectTarget } from "@server/lib/auth/redirect-target";
import { createSessionClient, withSessionCookies } from "@server/session";
import type { Route } from "./+types/auth-callback";

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const localeParam = url.searchParams.get("locale") ?? "";
  const locale = isLocale(localeParam) ? localeParam : DEFAULT_LOCALE;
  const code = url.searchParams.get("code");
  const target =
    safeRedirectTarget(url.searchParams.get("next")) ?? `/${locale}`;
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Preserve edited names while filling provider profile details.
      const user = data.user;
      if (user) {
        const metadata = user.user_metadata ?? {};
        const name = [metadata.full_name, metadata.name].find(
          (value) => typeof value === "string" && value.trim(),
        );
        const avatar = [metadata.avatar_url, metadata.picture].find(
          (value) => typeof value === "string" && value.trim(),
        );
        try {
          await Promise.all([
            name
              ? supabase
                  .from("profiles")
                  .update({ full_name: name.trim() })
                  .eq("id", user.id)
                  .is("full_name", null)
              : Promise.resolve(),
            avatar
              ? supabase
                  .from("profiles")
                  .update({ avatar_url: avatar.trim() })
                  .eq("id", user.id)
              : Promise.resolve(),
          ]);
        } catch {
          /* Profile sync must not discard a valid session. */
        }
      }
      return withSessionCookies(redirect(target), jar, isProduction);
    }
  }
  return withSessionCookies(
    redirect(`/${locale}/login?next=${encodeURIComponent(target)}`),
    jar,
    isProduction,
  );
}
