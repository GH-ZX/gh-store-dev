import type { Metadata } from "next";
import { AdminCard } from "@/components/admin/admin-form";
import { ThemeForm } from "@/components/admin/theme-form";
import { SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getWebsiteSettings } from "@/lib/services/admin-website.service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The store's appearance.
 *
 * Its own page rather than a card buried among SEO fields, because an owner
 * tuning the storefront's look is doing a different job from the one editing
 * metadata — and because the live preview reads better with room around it.
 * Everything here applies to every visitor at once; the one exception is the
 * light/dark switch, which stays each visitor's own choice.
 */
export default async function AppearancePage({
  params,
}: PageProps<"/[locale]/dashboard/appearance">) {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "admin");
  const theme = messages.website.theme;
  const settings = await getWebsiteSettings();

  return (
    <div className="grid gap-8">
      <SectionHeader as="h1" eyebrow={theme.eyebrow} title={theme.title} subtitle={theme.description} />

      <AdminCard title={theme.editorTitle} description={theme.globalHint}>
        <ThemeForm theme={settings.theme} messages={theme} errors={messages.website.errors} />
      </AdminCard>
    </div>
  );
}
