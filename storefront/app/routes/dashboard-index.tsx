import { Link } from "react-router";
import { getStoreHealth } from "@server/lib/services/store-health.service";
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
  const [stats, attention, kpis, earnings, series, latest, wallets, readiness, health] = await Promise.all([
    getAdminOverviewStats().catch(() => ({ products: null, activeProducts: null, offers: null, activeOffers: null, orders: null, customers: null })),
    getAttentionCounts().catch(() => ({ stuckOrders: null, pendingRecharges: null, openSupportThreads: null, pendingReviews: null, paymentIssues: null })),
    getSalesKpis().catch(() => ({ revenueToday: null, revenue7: null, revenuePrev7: null, orders7: null, newCustomers7: null, avgOrder7: null })),
    getEarnings().catch(() => null),
    getDailySeries(14).catch(() => null),
    getLatestOrders(5).catch(() => null),
    getWalletCards().catch(() => null),
    getCatalogReadiness(),
    getStoreHealth().catch(() => null),
  ]);
  return { locale, stats, attention, kpis, earnings, series, latest, wallets, readiness, health, updatedAt: new Date().toISOString() };
}

export default function DashboardIndex() {
  const data = useLoaderData<typeof loader>();
  const { state, revalidate } = useRevalidator();
  return <div className="space-y-8"><DashboardOverview data={data} refreshing={state === "loading"} onRefresh={() => { void revalidate(); }} />
    <section className="admin-card space-y-4"><h2 className="text-lg font-semibold">{data.locale === "ar" ? "رحلة التسوق · آخر 7 أيام" : "Shopping journey · last 7 days"}</h2><p className="text-sm text-[var(--ink-muted)]">{data.locale === "ar" ? "عدادات إجمالية دون هويات أو كلمات البحث. هذه زيارات صفحات وليست أعداد عملاء فريدين. قارنها ببيانات المبيعات والأرباح أعلاه." : "Aggregate counts without identities or search terms. These are page views, not unique customers. Compare them with sales and profit above."}</p>
    {data.health?.counts ? <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">{["catalog_view","product_view","search","checkout_view","recharge_view"].map((event,i)=><div key={event}><dt className="text-xs text-[var(--ink-muted)]">{(data.locale === "ar" ? ["التصفح","المنتجات","البحث","إتمام الطلب","التعبئة"] : ["Browsing","Products","Search","Checkout","Recharge"])[i]}</dt><dd className="text-2xl font-bold">{data.health?.counts?.[event] ?? 0}</dd></div>)}</dl> : <p>{data.locale === "ar" ? "القياسات غير متاحة حالياً" : "Measurements currently unavailable"}</p>}
    </section>
    {data.health?.terms ? <section className="admin-card space-y-3"><h2 className="text-lg font-semibold">{data.locale === "ar" ? "عروض تحتاج مراجعة الشروط" : "Offers needing terms review"} · {data.health.terms.count}</h2><ul className="grid gap-2">{data.health.terms.rows.map(row=><li key={row.id}><Link className="text-[var(--accent)] underline" to={`/${data.locale}/dashboard/catalog/${row.product_id}`}>{data.locale === "ar" ? row.name_ar : row.name_en}</Link></li>)}</ul></section> : null}
    </div>;
}
