import { headers } from "next/headers";
import { EmptyState } from "@/components/shared/states";
import { Section, SectionHeader } from "@/components/ui/section";
import { isLocale, DEFAULT_LOCALE, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";

/**
 * Localized not-found page.
 *
 * `not-found.tsx` receives no params, so the locale comes from the header the
 * middleware sets on every request.
 */
export default async function LocaleNotFound() {
  const requestHeaders = await headers();
  const headerLocale = requestHeaders.get("x-gh-store-locale") ?? DEFAULT_LOCALE;
  const locale: Locale = isLocale(headerLocale) ? headerLocale : DEFAULT_LOCALE;
  const common = getMessages(locale, "common");
  const catalog = getMessages(locale, "catalog");

  return (
    <Section spacing="page" mesh>
      <SectionHeader as="h1" eyebrow="404" title={catalog.offerDetail.notFoundTitle} />
      <EmptyState
        className="mt-10"
        title={catalog.offerDetail.notFoundTitle}
        description={catalog.offerDetail.notFoundDescription}
        action={{ href: `/${locale}/games`, label: common.navigation.games }}
      />
    </Section>
  );
}
