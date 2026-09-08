import { useLoaderData, useRevalidator } from "react-router";
import { DashboardOverview } from "@/components/admin/dashboard-overview";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { buildPageMeta } from "@/lib/seo";
import { requireDashboardAdmin } from "@server/dashboard-access";
import { getCatalogReadiness } from "@server/lib/services/admin-readiness.service";
import {
  getAdminOverviewStats,
  getAttentionCounts,
  getDailySeries,
  getEarnings,
  getLatestOrders,
  getSalesKpis,
  getWalletCards,
} from "@server/lib/services/admin-overview.service";
import type { Route } from "./+types/dashboard-index";

export function meta({ params }: Route.MetaArgs) {
  const locale = params.locale && isLocale(params.locale) ? params.locale : "ar";
  return buildPageMeta({ locale, path: "/dashboard", title: getMessages(locale, "admin").overview.title, description: "", noIndex: true });
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) throw new Response("Not Found", { status: 404 });
  await requireDashboardAdmin(request, locale);
  const [stats, attention, kpis, earnings, series, latest, wallets, readiness] = await Promise.all([
    getAdminOverviewStats().catch(() => ({ products: null, activeProducts: null, offers: null, activeOffers: null, orders: null, customers: null })),
    getAttentionCounts().catch(() => ({ stuckOrders: null, pendingRecharges: null, openSupportThreads: null, pendingReviews: null, paymentIssues: null })),
    getSalesKpis().catch(() => ({ revenueToday: null, revenue7: null, revenuePrev7: null, orders7: null, newCustomers7: null, avgOrder7: null })),
    getEarnings().catch(() => null),
    getDailySeries(14).catch(() => null),
    getLatestOrders(5).catch(() => null),
    getWalletCards().catch(() => null),
    getCatalogReadiness(),
  ]);
  return { locale, stats, attention, kpis, earnings, series, latest, wallets, readiness, updatedAt: new Date().toISOString() };
}

export default function DashboardIndex() {
  const data = useLoaderData<typeof loader>();
  const { state, revalidate } = useRevalidator();
  return <DashboardOverview data={data} refreshing={state === "loading"} onRefresh={() => { void revalidate(); }} />;
}
