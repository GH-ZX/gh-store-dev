import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { NavigationProgress } from "@/components/layout/navigation-progress";
import { Suspense } from "react";
import { SupportFab } from "@/components/support/support-fab";
import { getLocaleDirection, isLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { BRAND, buildBrandName } from "@/lib/brand";
import { getHeaderWalletPanel } from "@/lib/services/header-wallets.service";
import { getUnreadNotificationCount } from "@/lib/services/notification.service";
import { getSessionSummary } from "@/lib/services/session.service";
import { getPublicStoreSettings } from "@/lib/services/settings.service";

/**
 * Locale shell.
 *
 * Sets the reading direction for the subtree and renders the storefront chrome.
 * Social links come from store settings here so the footer stays a pure
 * presentational component.
 */
export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale: rawLocale } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale = rawLocale as Locale;
  const common = getMessages(locale, "common");
  const search = getMessages(locale, "search");
  const [settings, session] = await Promise.all([getPublicStoreSettings(), getSessionSummary()]);
  /*
   * Only an administrator sees the wallet balance, so only their render pays
   * for reading it. The unread count is one indexed count and is needed
   * for every signed-in reader, so the two run together. The wallet panel for
   * the account menus rides along in the same breath: own balance for a
   * customer, every customer wallet for an administrator.
   */
  const [unreadCount, walletPanel] = await Promise.all([
    getUnreadNotificationCount(session?.userId ?? null),
    session ? getHeaderWalletPanel(session) : Promise.resolve(null),
  ]);
  // The supplier balance is operational data; it lives on the providers page,
  // not in the storefront chrome, so an administrator carries no balance pill.
  const wallet = null;

  /*
   * The chrome name. The homepage tab always uses the configured name, but the
   * header, footer, and invoices keep the built-in brand unless the owner has
   * chosen to use the configured name everywhere.
   */
  const brandName = settings.branding.useEverywhere ? buildBrandName(settings, locale) : BRAND.name;

  return (
    <div lang={locale} dir={getLocaleDirection(locale)} className="flex min-h-screen flex-col">
      {/*
       * The owner's ambient layer, and nothing at all when they chose none —
       * the default. Decorative, so it is never announced, and it sits behind
       * the whole storefront rather than inside any section, which is what lets
       * it stay still while the page scrolls. The intensity attribute is the
       * owner's volume knob for it.
       */}
      {settings.theme.backdrop === "none" || settings.theme.backdropIntensity === "off" ? null : (
        <div
          className="gh-backdrop"
          data-backdrop={settings.theme.backdrop}
          data-intensity={settings.theme.backdropIntensity}
          aria-hidden="true"
        />
      )}

      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:start-4 focus:z-50 focus:rounded-[var(--radius-control)] focus:bg-[var(--accent)] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[var(--accent-ink)]"
      >
        {common.navigation.skipToContent}
      </a>

      <SiteHeader
        locale={locale}
        messages={common}
        searchMessages={search}
        session={session}
        wallet={wallet}
        walletPanel={walletPanel}
        unreadCount={unreadCount}
        brandName={brandName}
        notificationsLabel={getMessages(locale, "account").notifications.badgeLabel}
      />

      <main id="main" className="flex-1">
        {children}
      </main>

      <SiteFooter
        locale={locale}
        messages={common}
        socialLinks={settings.socialLinks}
        year={new Date().getFullYear()}
        brandName={brandName}
      />

      {/* Last in the DOM so it comes after the footer in reading order. */}
      <SupportFab locale={locale} label={common.links.support} signedIn={Boolean(session)} />
    </div>
  );
}
