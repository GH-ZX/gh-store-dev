import type { Metadata } from "next";
import { AdminCard } from "@/components/admin/admin-form";
import { BrandingForm } from "@/components/admin/branding-form";
import { ContactChannelsEditor } from "@/components/admin/contact-channels-editor";
import { HomeLayoutEditor } from "@/components/admin/home-layout-editor";
import { CarouselForm } from "@/components/admin/carousel-form";
import { PageSeoEditor } from "@/components/admin/page-seo-editor";
import { SeoForm } from "@/components/admin/seo-form";
import { SocialLinksEditor } from "@/components/admin/social-links-editor";
import { SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getHomePickCandidates, getWebsiteSettings } from "@/lib/services/admin-website.service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Website settings.
 *
 * One page for everything an operator changes about presentation, in the order
 * a visitor meets it: the homepage first, then the links and contact details in
 * the chrome, then the metadata nobody sees. Each card saves on its own, so a
 * mistake in one form never blocks another.
 */
export default async function WebsiteSettingsPage({
  params,
}: PageProps<"/[locale]/dashboard/website">) {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "admin").website;
  const [settings, candidates] = await Promise.all([
    getWebsiteSettings(),
    getHomePickCandidates(),
  ]);

  return (
    <div className="grid gap-8">
      <SectionHeader
        as="h1"
        eyebrow={messages.eyebrow}
        title={messages.title}
        subtitle={messages.description}
      />

      <AdminCard title={messages.branding.title} description={messages.branding.description}>
        <BrandingForm
          branding={settings.branding}
          messages={messages.branding}
          errors={messages.errors}
        />
      </AdminCard>

      <AdminCard title={messages.sections.title} description={messages.sections.description} collapsible defaultOpen={false}>
        <HomeLayoutEditor
          sections={settings.sections}
          candidates={candidates}
          locale={locale}
          messages={messages.sections}
          errors={messages.errors}
        />
      </AdminCard>

      <AdminCard title={messages.social.title} description={messages.social.description} collapsible defaultOpen={false}>
        <SocialLinksEditor
          links={settings.socialLinks}
          messages={messages.social}
          errors={messages.errors}
        />
      </AdminCard>

      <AdminCard title={messages.contact.title} description={messages.contact.description} collapsible defaultOpen={false}>
        <ContactChannelsEditor
          channels={settings.contactChannels}
          noteAr={settings.contactNoteAr}
          noteEn={settings.contactNoteEn}
          messages={messages.contact}
          errors={messages.errors}
        />
      </AdminCard>

      <AdminCard title={messages.carousel.title} description={messages.carousel.description} collapsible defaultOpen={false}>
        <CarouselForm
          section={settings.sections.find((section) => section.type === "carousel") ?? null}
          messages={messages.carousel}
          errors={messages.errors}
        />
      </AdminCard>

      <AdminCard title={messages.seo.title} description={messages.seo.description} collapsible defaultOpen={false}>
        <SeoForm seo={settings.seo} messages={messages.seo} errors={messages.errors} />
      </AdminCard>

      <AdminCard title={messages.pageSeo.title} description={messages.pageSeo.description} collapsible defaultOpen={false}>
        <PageSeoEditor
          pages={settings.seo.pages}
          messages={messages.pageSeo}
          seoMessages={messages.seo}
          errors={messages.errors}
        />
      </AdminCard>
    </div>
  );
}
