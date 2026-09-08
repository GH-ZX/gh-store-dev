import { data, Outlet, useLoaderData, useRevalidator } from "react-router";
import { useEffect } from "react";
import { getLocaleDirection, isLocale } from "@/i18n/config";
import { AdminHeader } from "@/components/admin/admin-header";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { buildPageMeta } from "@/lib/seo";
import { createPublicClient } from "@/lib/catalog-queries";
import { getPublicStoreSettings } from "@server/lib/services/settings.service";
import { getStorefrontThemeStyle } from "@/lib/storefront-theme";
import { getSessionSummary } from "@server/lib/services/session.service";
import { createSessionClient, getSessionUserId, redirectToLogin, sessionCookieHeaders, withSessionCookies } from "@server/session";
import type { Route } from "./+types/dashboard-layout";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const userId = await getSessionUserId(supabase);
  if (!userId) {
    const url = new URL(request.url);
    return withSessionCookies(
      redirectToLogin(request, locale, `${url.pathname}${url.search}`.replace(/\.data$/, "")),
      jar,
      isProduction,
    );
  }
  const session = await getSessionSummary(supabase, userId);
  if (!session?.isAdmin) {
    throw new Response("Forbidden", { status: 403 });
  }
  const settings = await getPublicStoreSettings(createPublicClient(env));
  return data(
    { locale, displayName: session.displayName, theme: settings.theme },
    { headers: sessionCookieHeaders(jar, isProduction) },
  );
}

export function meta({ params }: Route.MetaArgs) {
  const locale = params.locale && isLocale(params.locale) ? params.locale : "ar";
  return buildPageMeta({ locale, path: "/dashboard", title: "Dashboard", description: "", noIndex: true });
}

export default function DashboardLayout() {
  const { locale, displayName, theme } = useLoaderData<typeof loader>();
  const messages = getMessages(locale, "admin");
  const { revalidate } = useRevalidator();

  useEffect(() => {
    const refresh = () => { void revalidate(); };
    window.addEventListener("admin-action-complete", refresh);
    return () => window.removeEventListener("admin-action-complete", refresh);
  }, [revalidate]);

  return (
    <div
      data-storefront-shell=""
      data-admin-shell=""
      data-dashboard-shell=""
      style={getStorefrontThemeStyle(theme)}
      lang={locale}
      dir={getLocaleDirection(locale)}
      className="flex min-h-screen flex-col bg-[var(--canvas)] text-[var(--ink)]"
    >
      <AdminHeader
        locale={locale}
        messages={messages.shell}
        displayName={displayName}
      />
      <main id="main" className="gh-page py-6 sm:py-8 w-full flex-1">
        <Outlet />
      </main>
    </div>
  );
}
