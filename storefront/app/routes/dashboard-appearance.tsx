import { useLoaderData, type LoaderFunctionArgs, type ActionFunctionArgs } from "react-router";
import { isLocale } from "@/i18n/config";
import { runWebsiteAction, requireWebsiteAdmin } from "@server/website-route";
import { AdminCard } from "@/components/admin/admin-form";
import { ThemeForm } from "@/components/admin/theme-form";
import { SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { getWebsiteSettings } from "@server/lib/services/admin-website.service";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const locale = params.locale;
  if (!locale || !isLocale(locale)) throw new Response("Not Found", { status: 404 });
  await requireWebsiteAdmin(request, locale);
  const settings = await getWebsiteSettings();
  return { locale, settings };
}

export async function action({ request }: ActionFunctionArgs) { return runWebsiteAction(request, true); }

export function meta() { return [{ name: "robots", content: "noindex, nofollow" }]; }

export default function AppearancePage() {
  const { locale, settings } = useLoaderData<typeof loader>();
  const messages = getMessages(locale, "admin");
  const theme = messages.website.theme;
  return (
    <div className="grid gap-8">
      <SectionHeader as="h1" eyebrow={theme.eyebrow} title={theme.title} subtitle={theme.description} />

      <AdminCard title={theme.editorTitle} description={theme.globalHint}>
        <ThemeForm theme={settings.theme} messages={theme} errors={messages.website.errors} />
      </AdminCard>
    </div>
  );
}
