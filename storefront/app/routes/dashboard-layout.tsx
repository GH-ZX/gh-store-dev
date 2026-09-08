import { data, Outlet, useLoaderData, useRevalidator } from "react-router";
import { useEffect, useState } from "react";
import { getLocaleDirection, isLocale } from "@/i18n/config";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminHeader } from "@/components/admin/admin-header";
import { AdminMobileDrawer } from "@/components/admin/admin-mobile-drawer";
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
    const url = new URL(request.url);
    return withSessionCookies(
      redirectToLogin(request, locale, `${url.pathname}${url.search}`),
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
  const { locale, displayName } = useLoaderData<typeof loader>();
  const messages = getMessages(locale, "admin");
  const { revalidate } = useRevalidator();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  useEffect(() => {
    const refresh = () => { void revalidate(); };
    window.addEventListener("admin-action-complete", refresh);
    return () => window.removeEventListener("admin-action-complete", refresh);
  }, [revalidate]);

  return (
    <div
      data-admin-shell=""
      data-dashboard-shell=""
      lang={locale}
      dir={getLocaleDirection(locale)}
      className="admin-layout"
    >
      {/* Desktop Persistent Sidebar */}
      <AdminSidebar
        locale={locale}
        messages={messages.shell}
        displayName={displayName}
        className="hidden lg:flex"
      />

      {/* Mobile Drawer */}
      <AdminMobileDrawer
        isOpen={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        locale={locale}
        messages={messages.shell}
        displayName={displayName}
      />

      {/* Main Workspace Column */}
      <div className="admin-main-wrapper">
        <AdminHeader
          locale={locale}
          messages={messages.shell}
          displayName={displayName}
          onOpenMobile={() => setMobileDrawerOpen(true)}
        />
        <main id="admin-main" className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
