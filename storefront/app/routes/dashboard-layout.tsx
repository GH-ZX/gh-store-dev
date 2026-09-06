import { data, Link, Outlet, useLoaderData } from "react-router";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { buildPageMeta } from "@/lib/seo";
import { getSessionSummary } from "@server/lib/services/session.service";
import { createSessionClient, getSessionUserId, redirectToLogin, sessionCookieHeaders, withSessionCookies } from "@server/session";
import type { Route } from "./+types/dashboard-layout";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const userId = await getSessionUserId(supabase);
  if (!userId) {
    return withSessionCookies(
      redirectToLogin(request, locale, `/${locale}/dashboard`),
      jar,
      isProduction,
    );
  }
  const session = await getSessionSummary(supabase, userId);
  if (!session?.isAdmin) {
    throw new Response("Forbidden", { status: 403 });
  }
  return data(
    { locale, displayName: session.displayName },
    { headers: sessionCookieHeaders(jar, isProduction) },
  );
}

export function meta({ params }: Route.MetaArgs) {
  const locale = params.locale && isLocale(params.locale) ? params.locale : "ar";
  return buildPageMeta({ locale, path: "/dashboard", title: "Dashboard", description: "", noIndex: true });
}

const SECTIONS = ["catalog", "orders", "recharges", "customers", "providers", "website", "reviews", "support"] as const;

export default function DashboardLayout() {
  const { locale, displayName } = useLoaderData<typeof loader>() as unknown as {
    locale: "ar" | "en";
    displayName: string;
  };
  const admin = getMessages(locale, "admin");
  const shell = admin.shell as { nav: Record<string, string>; backToStore: string };

  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      <nav aria-label="dashboard" className="flex flex-wrap items-center gap-2 border-b pb-3">
        <strong>{displayName}</strong>
        {SECTIONS.map((section) => (
          <Link key={section} to={`/${locale}/dashboard/${section}`} className="rounded border px-2 py-1 text-sm">
            {shell.nav[section] ?? section}
          </Link>
        ))}
        <Link to={`/${locale}`} className="ms-auto text-sm underline">
          {shell.backToStore}
        </Link>
      </nav>
      <div className="mt-4">
        <Outlet />
      </div>
    </div>
  );
}
