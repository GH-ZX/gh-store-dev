import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getLocaleDirection, isLocale, type Locale } from "@/i18n/config";
import { getCommonMessages } from "@/i18n/messages";

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale: rawLocale } = (await params) as { locale: string };

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale = rawLocale as Locale;
  const messages = getCommonMessages(locale);
  const direction = getLocaleDirection(locale);

  return (
    <div lang={locale} dir={direction} className="flex min-h-screen flex-col">
      <SiteHeader locale={locale} labels={messages.navigation} />
      <main className="flex-1">{children}</main>
      <SiteFooter locale={locale} labels={messages.footer} />
    </div>
  );
}
