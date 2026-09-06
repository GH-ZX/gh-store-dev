import { getMaintenanceNotice } from "@/lib/maintenance";
import { Section } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";
import { SupportFab } from "@/components/support/support-fab";
import {
  data,
  Outlet,
  redirect,
  useLoaderData,
  useLocation,
  useMatches,
} from "react-router";
import { getLocaleDirection, isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { buildBrandName } from "@/lib/brand";
import { APP_NAME } from "@/lib/app-config";
import {
  SiteFooter,
  SiteHeader,
  type ChromeData,
} from "@/components/site-chrome";
import {
  StorefrontHeader,
  StorefrontFooter,
  getStorefrontThemeStyle,
} from "@/components/layout/storefront-chrome";
import { getPublicStoreSettings } from "@server/lib/services/settings.service";
import {
  getHeaderWalletPanel,
  getSessionSummary,
  getUnreadNotificationCount,
} from "@server/lib/services/session.service";
import {
  createSessionClient,
  getSessionUserId,
  sessionCookieHeaders,
  withSessionCookies,
} from "@server/session";
import type { Route } from "./+types/locale-layout";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    const url = new URL(request.url);
    throw redirect(`/ar${url.pathname}${url.search}`);
  }
  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const userId = await getSessionUserId(supabase);
  const [session, settings] = await Promise.all([
    getSessionSummary(supabase, userId),
    getPublicStoreSettings(supabase),
  ]);
  const [walletPanel, unreadCount] = await Promise.all([
    getHeaderWalletPanel(supabase, session),
    getUnreadNotificationCount(supabase, userId),
  ]);
  const maintenance = getMaintenanceNotice(
    settings,
    session,
    locale,
    new URL(request.url).pathname,
  );
  const chrome: ChromeData = {
    maintenance,
    locale,
    session,
    walletPanel,
    unreadCount,
    brandName: settings.branding.useEverywhere
      ? buildBrandName(settings, locale)
      : APP_NAME,
    socialLinks: settings.socialLinks,
    year: new Date().getFullYear(),
    theme: settings.theme,
  };
  return data(chrome, {
    status: maintenance ? 503 : 200,
    headers: sessionCookieHeaders(jar, isProduction),
  });
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    const url = new URL(request.url);
    throw redirect(`/ar${url.pathname}${url.search}`);
  }
  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const form = await request.formData();
  if (form.get("intent") === "sign-out") {
    await supabase.auth.signOut();
  }
  return withSessionCookies(redirect(`/${locale}`), jar, isProduction);
}

export default function LocaleLayout() {
  const chrome = useLoaderData<typeof loader>() as unknown as ChromeData;
  const { locale } = chrome;
  const { pathname } = useLocation();
  const matches = useMatches();
  const isDashboard = matches.some(
    (match) => match.id === "routes/dashboard-layout",
  );
  const Header = isDashboard ? SiteHeader : StorefrontHeader;
  const common = getMessages(locale, "common");
  const notificationsLabel = getMessages(locale, "account").notifications
    .badgeLabel as string;

  return (
    <div
      data-storefront-shell={isDashboard ? undefined : ""}
      data-storefront-checkout={
        !isDashboard && pathname.startsWith(`/${locale}/checkout/`)
          ? ""
          : undefined
      }
      style={isDashboard ? undefined : getStorefrontThemeStyle(chrome.theme)}
      lang={locale}
      dir={getLocaleDirection(locale)}
      className="flex min-h-screen flex-col"
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-[var(--surface)] focus:p-4"
      >
        {common.navigation.skipToContent}
      </a>
      {isDashboard &&
      chrome.theme?.backdrop !== "none" &&
      chrome.theme?.backdropIntensity !== "off" ? (
        <div
          className="gh-backdrop"
          data-backdrop={chrome.theme?.backdrop}
          data-intensity={chrome.theme?.backdropIntensity}
          aria-hidden="true"
        />
      ) : null}
      <Header
        locale={locale}
        messages={common}
        data={chrome}
        notificationsLabel={notificationsLabel}
      />
      <main id="main" className="w-full flex-1">
        {chrome.maintenance ? (
          <Section spacing="page">
            <div className="mx-auto max-w-xl rounded-[var(--radius-shell)] border bg-[var(--surface)] p-8 text-center">
              <h1 className="text-2xl font-semibold">
                {locale === "ar" ? "المتجر تحت الصيانة" : "Store maintenance"}
              </h1>
              <p className="mt-4 leading-7 text-[var(--ink-soft)]">
                {chrome.maintenance.message}
              </p>
              <ButtonLink
                className="mt-6"
                href={`/${locale}/login`}
                variant="secondary"
              >
                {common.account.signIn}
              </ButtonLink>
            </div>
          </Section>
        ) : (
          <Outlet />
        )}
      </main>
      {isDashboard ? (
        <SiteFooter
          locale={locale}
          messages={common}
          socialLinks={chrome.socialLinks}
          year={chrome.year}
          brandName={chrome.brandName}
        />
      ) : (
        <StorefrontFooter locale={locale} messages={common} data={chrome} />
      )}
      <SupportFab
        locale={locale}
        label={common.links.support}
        signedIn={Boolean(chrome.session)}
      />
    </div>
  );
}
