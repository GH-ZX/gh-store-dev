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
import "@/styles/admin-shell.css";

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

  const url = new URL(request.url);
  const isMfaRoute = url.pathname.endsWith("/dashboard/mfa") || url.pathname.includes("/dashboard/mfa.");

  let mfaEnrolled = false;
  if (typeof supabase.auth?.mfa?.getAuthenticatorAssuranceLevel === "function") {
    try {
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData) {
        if (!isMfaRoute && aalData.currentLevel === "aal1" && aalData.nextLevel === "aal2") {
          const next = `${url.pathname}${url.search}`.replace(/\.data$/, "");
          return withSessionCookies(
            Response.redirect(new URL(`/${locale}/dashboard/mfa?next=${encodeURIComponent(next)}`, request.url), 302),
            jar,
            isProduction,
          );
        }
        mfaEnrolled = aalData.nextLevel === "aal2";
      }
    } catch {}
  }

  const settings = await getPublicStoreSettings(createPublicClient(env));
  return data(
    {
      locale,
      displayName: session.displayName,
      theme: settings.theme,
      showLogo: settings.branding.showLogo ?? false,
      mfaEnrollmentNeeded: !mfaEnrolled && !isMfaRoute,
    },
    { headers: sessionCookieHeaders(jar, isProduction) },
  );
}

export function meta({ params }: Route.MetaArgs) {
  const locale = params.locale && isLocale(params.locale) ? params.locale : "ar";
  return buildPageMeta({ locale, path: "/dashboard", title: "Dashboard", description: "", noIndex: true });
}

export default function DashboardLayout() {
  const { locale, displayName, theme, showLogo, mfaEnrollmentNeeded } = useLoaderData<typeof loader>();
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
        showLogo={showLogo}
      />
      {mfaEnrollmentNeeded && (
        <aside
          role="status"
          aria-label="Security recommendation"
          className="bg-[var(--surface-strong)] border-b border-[var(--line)] px-4 py-2.5 text-xs sm:text-sm text-[var(--ink-soft)] flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
            <span>
              {locale === "ar"
                ? "يُنصح بتفعيل التحقق بخطوتين (2FA) لحماية لوحة الإدارة."
                : "Two-factor authentication (2FA) is recommended to protect your admin dashboard."}
            </span>
          </div>
          <a
            href={`/${locale}/dashboard/mfa`}
            className="font-medium text-[var(--accent-primary)] hover:underline shrink-0"
          >
            {locale === "ar" ? "تفعيل الآن ←" : "Set up now →"}
          </a>
        </aside>
      )}
      <main id="main" className="gh-page py-6 sm:py-8 w-full flex-1">
        <Outlet />
      </main>
    </div>
  );
}
