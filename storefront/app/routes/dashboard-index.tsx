import { Link, useLoaderData } from "react-router";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { buildPageMeta } from "@/lib/seo";
import type { Route } from "./+types/dashboard-index";

export async function loader({ params }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  return { locale };
}

export function meta({ params }: Route.MetaArgs) {
  const locale = params.locale && isLocale(params.locale) ? params.locale : "ar";
  return buildPageMeta({ locale, path: "/dashboard", title: "Dashboard", description: "", noIndex: true });
}

export default function DashboardIndex() {
  const { locale } = useLoaderData<typeof loader>() as unknown as { locale: "ar" | "en" };
  const overview = getMessages(locale, "admin").overview as { title: string; description: string };

  return (
    <>
      <h1 className="text-2xl font-bold">{overview.title}</h1>
      <p className="opacity-70">{overview.description}</p>
      <Link to={`/${locale}/dashboard/catalog`} className="mt-4 inline-block rounded border px-4 py-2">
        Catalog →
      </Link>
    </>
  );
}
