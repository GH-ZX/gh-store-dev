import { data, useLoaderData, useSearchParams } from "react-router";
import type { Route } from "./+types/dashboard-reports";
import { isLocale, type Locale } from "@/i18n/config";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { requireAdminId } from "@server/lib/auth/guards";
import { createSessionClient, sessionCookieHeaders } from "@server/session";
import { formatPrice } from "@/lib/format/money";
import { ArrowIcon } from "@/components/ui/icons";

export interface SalesReportRow {
  group_key: string;
  group_label: string;
  orders_count: number;
  items_count: number;
  revenue: number;
  cost: number;
  profit: number;
  margin_percent: number;
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }

  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  await requireAdminId(supabase);

  const url = new URL(request.url);
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const defaultTo = now.toISOString().slice(0, 10);

  const from = url.searchParams.get("from") || defaultFrom;
  const to = url.searchParams.get("to") || defaultTo;
  const group = url.searchParams.get("group") || "day";

  const { data: rowsData, error } = await supabase.rpc("admin_sales_report", {
    p_from: from,
    p_to: to,
    p_group: group,
  });

  const rows: SalesReportRow[] = (rowsData as any[] | null)?.map((r) => ({
    group_key: r.group_key,
    group_label: r.group_label,
    orders_count: Number(r.orders_count || 0),
    items_count: Number(r.items_count || 0),
    revenue: Number(r.revenue || 0),
    cost: Number(r.cost || 0),
    profit: Number(r.profit || 0),
    margin_percent: Number(r.margin_percent || 0),
  })) ?? [];

  const totals = rows.reduce(
    (acc, row) => ({
      revenue: acc.revenue + row.revenue,
      cost: acc.cost + row.cost,
      profit: acc.profit + row.profit,
      orders_count: acc.orders_count + row.orders_count,
      items_count: acc.items_count + row.items_count,
    }),
    { revenue: 0, cost: 0, profit: 0, orders_count: 0, items_count: 0 },
  );

  const overallMargin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;

  return data(
    {
      locale,
      rows,
      totals: {
        revenue: Math.round(totals.revenue * 100) / 100,
        cost: Math.round(totals.cost * 100) / 100,
        profit: Math.round(totals.profit * 100) / 100,
        orders_count: totals.orders_count,
        items_count: totals.items_count,
        margin_percent: Math.round(overallMargin * 10) / 10,
      },
      from,
      to,
      group,
    },
    { headers: sessionCookieHeaders(jar, isProduction) },
  );
}

export default function DashboardReportsRoute() {
  const { locale, rows, totals, from, to, group } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAr = locale === "ar";

  const handleExportCsv = () => {
    const headers = [
      isAr ? "البعد" : "Dimension",
      isAr ? "الطلبات" : "Orders",
      isAr ? "العناصر" : "Items",
      isAr ? "الإيرادات ($)" : "Revenue ($)",
      isAr ? "التكلفة ($)" : "Cost ($)",
      isAr ? "الربح ($)" : "Profit ($)",
      isAr ? "الهامش (%)" : "Margin (%)",
    ];

    const csvLines = [
      headers.join(","),
      ...rows.map((r) =>
        [
          `"${r.group_label.replace(/"/g, '""')}"`,
          r.orders_count,
          r.items_count,
          r.revenue.toFixed(2),
          r.cost.toFixed(2),
          r.profit.toFixed(2),
          r.margin_percent.toFixed(1) + "%",
        ].join(","),
      ),
      [
        isAr ? '"الإجمالي"' : '"TOTAL"',
        totals.orders_count,
        totals.items_count,
        totals.revenue.toFixed(2),
        totals.cost.toFixed(2),
        totals.profit.toFixed(2),
        totals.margin_percent.toFixed(1) + "%",
      ].join(","),
    ];

    const blob = new Blob(["\uFEFF" + csvLines.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `sales-report-${group}-${from}-to-${to}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const setPreset = (days: number) => {
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const p = new URLSearchParams(searchParams);
    p.set("from", start);
    p.set("to", end);
    setSearchParams(p);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--ink)]">
            {isAr ? "تقارير المبيعات والأرباح" : "Sales & Profit Reports"}
          </h1>
          <p className="text-xs text-[var(--ink-muted)] mt-1">
            {isAr
              ? "تحليل مالي مفصل للمبيعات والتكاليف وهوامش الربح."
              : "Comprehensive financial overview of sales revenue, supplier costs, and net margins."}
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[var(--radius-control,10px)] border border-[var(--line)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-strong)] transition-colors cursor-pointer"
        >
          <span>{isAr ? "تصدير CSV" : "Export CSV"}</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card,18px)] border border-[var(--line)] bg-[var(--surface)] p-4">
        <form className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[var(--ink-muted)]">
              {isAr ? "من:" : "From:"}
            </span>
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="rounded-lg border border-[var(--line)] bg-[var(--canvas)] px-2.5 py-1 text-xs text-[var(--ink)]"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[var(--ink-muted)]">
              {isAr ? "إلى:" : "To:"}
            </span>
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="rounded-lg border border-[var(--line)] bg-[var(--canvas)] px-2.5 py-1 text-xs text-[var(--ink)]"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[var(--ink-muted)]">
              {isAr ? "تجميع حسب:" : "Group by:"}
            </span>
            <select
              name="group"
              defaultValue={group}
              className="rounded-lg border border-[var(--line)] bg-[var(--canvas)] px-2.5 py-1 text-xs text-[var(--ink)]"
            >
              <option value="day">{isAr ? "اليوم" : "Day"}</option>
              <option value="product">{isAr ? "المنتج" : "Product"}</option>
              <option value="category">{isAr ? "القسم" : "Category"}</option>
              <option value="provider">{isAr ? "المزود" : "Provider"}</option>
            </select>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-[var(--accent-ink)] cursor-pointer"
          >
            {isAr ? "تحديث" : "Apply"}
          </button>
        </form>

        <div className="ms-auto flex items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setPreset(7)}
            className="rounded px-2 py-0.5 text-[var(--ink-muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)] cursor-pointer"
          >
            {isAr ? "آخر 7 أيام" : "7 Days"}
          </button>
          <button
            type="button"
            onClick={() => setPreset(30)}
            className="rounded px-2 py-0.5 text-[var(--ink-muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)] cursor-pointer"
          >
            {isAr ? "آخر 30 يوم" : "30 Days"}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-[var(--radius-card,18px)] border border-[var(--line)] bg-[var(--surface)] p-4">
          <p className="text-xs text-[var(--ink-muted)]">{isAr ? "إجمالي الإيرادات" : "Total Revenue"}</p>
          <p className="mt-1 text-lg font-bold text-[var(--ink)]" dir="ltr">
            {formatPrice(totals.revenue, "USD", locale)}
          </p>
        </div>
        <div className="rounded-[var(--radius-card,18px)] border border-[var(--line)] bg-[var(--surface)] p-4">
          <p className="text-xs text-[var(--ink-muted)]">{isAr ? "تكلفة الموردين" : "Supplier Cost"}</p>
          <p className="mt-1 text-lg font-bold text-[var(--ink)]" dir="ltr">
            {formatPrice(totals.cost, "USD", locale)}
          </p>
        </div>
        <div className="rounded-[var(--radius-card,18px)] border border-[var(--line)] bg-[var(--surface)] p-4">
          <p className="text-xs text-[var(--ink-muted)]">{isAr ? "صافي الربح" : "Net Profit"}</p>
          <p className="mt-1 text-lg font-bold text-[var(--success,#2b8a3e)]" dir="ltr">
            {formatPrice(totals.profit, "USD", locale)}
          </p>
        </div>
        <div className="rounded-[var(--radius-card,18px)] border border-[var(--line)] bg-[var(--surface)] p-4">
          <p className="text-xs text-[var(--ink-muted)]">{isAr ? "هامش الربح" : "Profit Margin"}</p>
          <p className="mt-1 text-lg font-bold text-[var(--ink)]" dir="ltr">
            {totals.margin_percent}%
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1 rounded-[var(--radius-card,18px)] border border-[var(--line)] bg-[var(--surface)] p-4">
          <p className="text-xs text-[var(--ink-muted)]">{isAr ? "عدد الطلبات / العناصر" : "Orders / Items"}</p>
          <p className="mt-1 text-lg font-bold text-[var(--ink)]" dir="ltr">
            {totals.orders_count} / {totals.items_count}
          </p>
        </div>
      </div>

      {/* Report Table */}
      <div className="overflow-hidden rounded-[var(--radius-card,18px)] border border-[var(--line)] bg-[var(--surface)]">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--surface-strong)] text-[var(--ink-muted)]">
                <th className="p-3 text-start font-semibold">{isAr ? "البعد" : "Dimension"}</th>
                <th className="p-3 text-end font-semibold">{isAr ? "الطلبات" : "Orders"}</th>
                <th className="p-3 text-end font-semibold">{isAr ? "العناصر" : "Items"}</th>
                <th className="p-3 text-end font-semibold">{isAr ? "الإيرادات" : "Revenue"}</th>
                <th className="p-3 text-end font-semibold">{isAr ? "التكلفة" : "Cost"}</th>
                <th className="p-3 text-end font-semibold">{isAr ? "الربح" : "Profit"}</th>
                <th className="p-3 text-end font-semibold">{isAr ? "الهامش" : "Margin"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-[var(--ink-muted)]">
                    {isAr ? "لا توجد بيانات للفترة المحددة." : "No sales data found for the selected period."}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.group_key} className="hover:bg-[var(--surface-strong)] transition-colors">
                    <td className="p-3 font-medium text-[var(--ink)]">
                      <bdi>{r.group_label}</bdi>
                    </td>
                    <td className="p-3 text-end text-[var(--ink-muted)]" dir="ltr">
                      {r.orders_count}
                    </td>
                    <td className="p-3 text-end text-[var(--ink-muted)]" dir="ltr">
                      {r.items_count}
                    </td>
                    <td className="p-3 text-end font-medium text-[var(--ink)]" dir="ltr">
                      {formatPrice(r.revenue, "USD", locale)}
                    </td>
                    <td className="p-3 text-end text-[var(--ink-muted)]" dir="ltr">
                      {formatPrice(r.cost, "USD", locale)}
                    </td>
                    <td className="p-3 text-end font-semibold text-[var(--success,#2b8a3e)]" dir="ltr">
                      {formatPrice(r.profit, "USD", locale)}
                    </td>
                    <td className="p-3 text-end text-[var(--ink-soft)]" dir="ltr">
                      {r.margin_percent}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
