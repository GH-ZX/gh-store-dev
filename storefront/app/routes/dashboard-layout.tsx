import { data, Outlet, useLoaderData, useRevalidator } from "react-router";
import { useEffect } from "react";
import { isLocale } from "@/i18n/config";
import { DashboardNav } from "@/components/admin/dashboard-nav";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { buildPageMeta } from "@/lib/seo";
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
    return withSessionCookies(
      redirectToLogin(request, locale, `/${locale}/dashboard`),
      jar,
      isProduction,
    );
  }
  const session = await getSessionSummary(supabase, userId);
  if (!session?.isAdmin) {
    throw new Response("Forbidden", { status: 403 });
  }
  return data(
    { locale, displayName: session.displayName },
    { headers: sessionCookieHeaders(jar, isProduction) },
  );
}

export function meta({ params }: Route.MetaArgs) {
  const locale = params.locale && isLocale(params.locale) ? params.locale : "ar";
  return buildPageMeta({ locale, path: "/dashboard", title: "Dashboard", description: "", noIndex: true });
}

export default function DashboardLayout() {
  const { locale } = useLoaderData<typeof loader>();
  const messages = getMessages(locale, "admin");
  const { revalidate } = useRevalidator();
  useEffect(() => {
    const refresh = () => { void revalidate(); };
    window.addEventListener("admin-action-complete", refresh);
    return () => window.removeEventListener("admin-action-complete", refresh);
  }, [revalidate]);
  return (
    <div data-dashboard-shell className="gh-page py-6 sm:py-8">
      <DashboardNav locale={locale} messages={messages.shell} />
      <div className="mt-6"><Outlet /></div>
    </div>
  );
}
