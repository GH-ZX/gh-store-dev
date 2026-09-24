import { getAdminExperienceSettings, saveExperienceSettings } from "@server/lib/services/experience-settings.service";
import { ExperienceSettings } from "@/components/admin/experience-settings";
import { useLoaderData, type LoaderFunctionArgs, type ActionFunctionArgs } from "react-router";
import { isLocale } from "@/i18n/config";
import { runWebsiteAction, requireWebsiteAdmin } from "@server/website-route";
import { AdminCard } from "@/components/admin/admin-form";
import { BrandingForm } from "@/components/admin/branding-form";
import { ContactChannelsEditor } from "@/components/admin/contact-channels-editor";
import { HomeLayoutEditor } from "@/components/admin/home-layout-editor";
import { PageSeoEditor } from "@/components/admin/page-seo-editor";
import { SeoForm } from "@/components/admin/seo-form";
import { SocialLinksEditor } from "@/components/admin/social-links-editor";
import { GlobeIcon } from "@/components/ui/icons";
import { getMessages } from "@/i18n/messages";
import { getHomePickCandidates, getWebsiteSettings } from "@server/lib/services/admin-website.service";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const locale = params.locale;
  if (!locale || !isLocale(locale)) throw new Response("Not Found", { status: 404 });
  await requireWebsiteAdmin(request, locale);
  const [settings, candidates] = await Promise.all([getWebsiteSettings(), getHomePickCandidates()]);
  return { locale, settings, candidates, experience: await getAdminExperienceSettings() };
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") throw new Response("Method Not Allowed", { status: 405 });
  if (request.headers.get("origin") !== new URL(request.url).origin) throw new Response("Forbidden", { status: 403 });
  const form = await request.clone().formData();
  if (["saveDiscovery", "savePosthog"].includes(String(form.get("intent")))) {
    const locale = new URL(request.url).pathname.split("/")[1] === "en" ? "en" : "ar";
    await requireWebsiteAdmin(request, locale);
    return saveExperienceSettings(form);
  }
  return runWebsiteAction(request);
}

export function meta() { return [{ name: "robots", content: "noindex, nofollow" }]; }

export default function WebsiteSettingsPage() {
  const { locale, settings, candidates, experience } = useLoaderData<typeof loader>();
  const messages = getMessages(locale, "admin").website;
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)]">
          <GlobeIcon className="size-4 text-[var(--accent)]" />
          <span>{messages.eyebrow}</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--ink)] sm:text-3xl">
          {messages.title}
        </h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          {messages.description}
        </p>
      </div>

      <ExperienceSettings settings={experience} locale={locale} />
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
