import { useLoaderData, type LoaderFunctionArgs, type ActionFunctionArgs } from "react-router";
import { isLocale } from "@/i18n/config";
import { runWebsiteAction, requireWebsiteAdmin } from "@server/website-route";
import { AdminCard } from "@/components/admin/admin-form";
import { ThemeForm } from "@/components/admin/theme-form";
import { SparkIcon } from "@/components/ui/icons";
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
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)]">
          <SparkIcon className="size-4 text-[var(--accent)]" />
          <span>{theme.eyebrow}</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--ink)] sm:text-3xl">
          {theme.title}
        </h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          {theme.description}
        </p>
      </div>

      <AdminCard title={theme.editorTitle} description={theme.globalHint}>
        <ThemeForm theme={settings.theme} messages={theme} errors={messages.website.errors} />
      </AdminCard>
    </div>
  );
}
