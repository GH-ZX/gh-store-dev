import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getLocaleDirection, isLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
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
  const settings = await getPublicStoreSettings();

  return (
    <div lang={locale} dir={getLocaleDirection(locale)} className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:start-4 focus:z-50 focus:rounded-[var(--radius-control)] focus:bg-[var(--accent)] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[var(--accent-ink)]"
      >
        {common.navigation.skipToContent}
      </a>

      <SiteHeader locale={locale} messages={common} searchMessages={search} />

      <main id="main" className="flex-1">
        {children}
      </main>

      <SiteFooter
        locale={locale}
        messages={common}
        socialLinks={settings.socialLinks}
        year={new Date().getFullYear()}
      />
    </div>
  );
}
