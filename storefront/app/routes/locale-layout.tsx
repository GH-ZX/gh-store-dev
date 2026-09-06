import { data, Outlet, redirect, useLoaderData } from "react-router";
import { getLocaleDirection, isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { buildBrandName } from "@/lib/brand";
import { APP_NAME } from "@/lib/app-config";
import { SiteFooter, SiteHeader, type ChromeData } from "@/components/site-chrome";
import { getSocialLinkLabel, type SocialLink } from "@server/lib/settings/public-settings";
import { getPublicStoreSettings } from "@server/lib/services/settings.service";
import {
  getHeaderWalletPanel,
  getSessionSummary,
  getUnreadNotificationCount,
} from "@server/lib/services/session.service";
import { createSessionClient, getSessionUserId, sessionCookieHeaders, withSessionCookies } from "@server/session";
import type { Route } from "./+types/locale-layout";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
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
  const chrome: ChromeData = {
    locale,
    session,
    walletPanel,
    unreadCount,
    brandName: settings.branding.useEverywhere ? buildBrandName(settings, locale) : APP_NAME,
    socialLinks: settings.socialLinks.map((link: SocialLink) => ({
      id: link.id,
      url: link.url,
      label: getSocialLinkLabel(link, locale),
    })),
    year: new Date().getFullYear(),
  };
  return data(chrome, { headers: sessionCookieHeaders(jar, isProduction) });
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
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
  const common = getMessages(locale, "common");
  const notificationsLabel = getMessages(locale, "account").notifications.badgeLabel as string;

  return (
    <div lang={locale} dir={getLocaleDirection(locale)} className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only">
        {common.navigation.skipToContent}
      </a>
      <SiteHeader
        locale={locale}
        messages={common}
        data={chrome}
        notificationsLabel={notificationsLabel}
      />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 p-4">
        <Outlet />
      </main>
      <SiteFooter
        locale={locale}
        messages={common}
        socialLinks={chrome.socialLinks}
        year={chrome.year}
        brandName={chrome.brandName}
      />
    </div>
  );
}
