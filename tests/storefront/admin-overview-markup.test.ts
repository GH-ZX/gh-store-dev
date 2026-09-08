import { createRequire } from "node:module";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../storefront/node_modules/react-router/dist/development/index.js", async (original) => {
  const actual = await original<typeof import("../../storefront/node_modules/react-router/dist/development/index.js")>();
  const { createRequire } = await import("node:module");
  const { createElement } = createRequire(new URL("../../storefront/package.json", import.meta.url))("react") as typeof import("react");
  return {
    ...actual,
    Link: ({ to, children, ...props }: Omit<ComponentProps<"a">, "href"> & { to: string; children?: ReactNode }) => createElement("a", { href: to, ...props }, children),
  };
});

import { DashboardOverview, type DashboardOverviewData } from "../../storefront/app/components/admin/dashboard-overview";
import { getMessages } from "../../storefront/app/i18n/messages";
const requireApp = createRequire(new URL("../../storefront/package.json", import.meta.url));
const { createElement } = requireApp("react") as typeof import("react");
const { renderToStaticMarkup } = requireApp("react-dom/server") as typeof import("react-dom/server");

const base: DashboardOverviewData = {
  locale: "en", updatedAt: "2026-09-08T12:30:00Z",
  stats: { products: 12, activeProducts: 10, offers: 24, activeOffers: 20, orders: 0, customers: 0 },
  attention: { stuckOrders: 0, pendingRecharges: 0, openSupportThreads: 0, pendingReviews: 0, paymentIssues: 0 },
  kpis: { revenueToday: 0, revenue7: 0, revenuePrev7: 0, orders7: 0, newCustomers7: 0, avgOrder7: null },
  earnings: null, series: [{ date: "2026-09-08", label: "09-08", orders: 0, revenue: 0 }], latest: [], wallets: [],
  readiness: { publishedProducts: 10, missingOffers: 0, missingArtwork: 0, missingCategory: 0, needsAttention: 0, items: [] },
};
const render = (overrides: Partial<DashboardOverviewData> = {}, refreshing = false) => renderToStaticMarkup(createElement(DashboardOverview, { data: { ...base, ...overrides }, refreshing, onRefresh: () => {} }));

describe("actionable dashboard overview", () => {
  it("links each work queue to an existing useful destination", () => {
    const markup = render();
    for (const suffix of ["orders?status=attention", "recharges", "payments?status=attention", "support", "reviews?status=pending"]) {
      expect(markup).toContain(`href="/en/dashboard/${suffix}"`);
    }
    expect(markup).toContain("All clear");
  });

  it("does not claim all clear or zero work when any count is unavailable", () => {
    const markup = render({ attention: { ...base.attention, pendingRecharges: null } });
    expect(markup).toContain("Some checks are unavailable");
    expect(markup).toContain("Count unavailable. Open the queue or refresh to try again.");
    expect(markup).not.toContain("All clear");
  });

  it("keeps failed reads distinct from genuine empty states", () => {
    const copy = getMessages("en", "admin").overview;
    const markup = render({ latest: null, wallets: null, series: null, readiness: null });
    for (const text of [copy.latest.unavailable, copy.wallets.unavailable, copy.chart.unavailable, copy.readiness.unavailable]) expect(markup).toContain(text);
    for (const text of [copy.latest.empty, copy.wallets.none, copy.chart.empty, copy.readiness.emptyTitle]) expect(markup).not.toContain(text);
  });

  it("shows a real no-sales state and accessible daily figures without inventing chart bars", () => {
    const markup = render();
    expect(markup).toContain("No paid orders were recorded in this period.");
    expect(markup).toContain("No paid orders in this period.");
    expect(markup).toContain("View daily figures");
    expect(markup).toContain('<time dateTime="2026-09-08">');
    expect(markup).not.toContain('style="height:');
  });

  it("shows only configured missing checks and sends each product directly to its editor", () => {
    const markup = render({ readiness: { publishedProducts: 20, missingOffers: 3, missingCategory: 7, missingArtwork: 0, needsAttention: 8, items: [
      { id: "needs-category", nameEn: "Test subscription", nameAr: "اشتراك تجريبي", missingOffers: false, missingCategory: true, missingArtwork: false },
    ] } });
    expect(markup).toContain('href="/en/dashboard/catalog/needs-category"');
    expect(markup).toContain("1 of 8 products shown");
    expect(markup).toContain("Missing category");
    expect(markup).toContain("<bdi>Test subscription</bdi>");
  });

  it("retains data and announces the pending refresh while disabling repeated clicks", () => {
    const markup = render({}, true);
    expect(markup).toMatch(/<button[^>]*disabled=""/);
    expect(markup).toContain("Refreshing…");
    expect(markup).toContain("Checking the latest data. Your current view stays visible.");
    expect(markup).toContain("Finish your catalog");
  });

  it("localizes Arabic labels and keeps mixed product names isolated", () => {
    const markup = render({ locale: "ar", readiness: { publishedProducts: 1, missingOffers: 0, missingCategory: 1, missingArtwork: 0, needsAttention: 1, items: [
      { id: "arabic-product", nameEn: "Test subscription", nameAr: "اشتراك ChatGPT Plus", missingOffers: false, missingCategory: true, missingArtwork: false },
    ] } });
    expect(markup).toContain('href="/ar/dashboard/catalog/arabic-product"');
    expect(markup).toContain("<bdi>اشتراك ChatGPT Plus</bdi>");
    expect(markup).toContain(getMessages("ar", "admin").overview.readiness.missingCategory);
    expect(markup).not.toContain("Finish your catalog");
  });

  it("reports gross margin against revenue rather than markup against supplier cost", () => {
    const period = { revenue: 200, cost: 150, profit: 50, unmappedItems: 0 };
    const markup = render({ earnings: { week: period, month: period } });
    expect(markup).toContain('<bdi dir="ltr">25%</bdi>');
    expect(markup).toContain("Gross margin");
    expect(markup).not.toContain("33.3%");
  });

  it("keeps small margins proportional instead of drawing an invented minimum bar", () => {
    const period = { revenue: 200, cost: 199.8, profit: 0.2, unmappedItems: 0 };
    const markup = render({ earnings: { week: period, month: period } });
    expect(markup).toContain('<bdi dir="ltr">0.1%</bdi>');
    expect(markup).toContain('style="width:0.1%"');
  });

  it("preserves negative margin and revenue-comparison signs", () => {
    const period = { revenue: 100, cost: 125, profit: -25, unmappedItems: 0 };
    const markup = render({ earnings: { week: period, month: period }, kpis: { ...base.kpis, revenue7: 50, revenuePrev7: 100 } });
    expect(markup).toContain('<bdi dir="ltr">-25%</bdi>');
    expect(markup).toContain("-50% vs previous week");
    expect(markup).toContain("$-25.00");
  });

  it.each([
    { revenue: 100, cost: null, profit: 60, unmappedItems: 0 },
    { revenue: 100, cost: 40, profit: 60, unmappedItems: 1 },
    { revenue: 100, cost: 40, profit: null, unmappedItems: 0 },
  ])("does not claim a margin or known profit for incomplete supplier cost data: %j", (period) => {
    const markup = render({ earnings: { week: period, month: period } });
    expect(markup).not.toContain("Gross margin");
    expect(markup).not.toContain("$60.00");
    expect(markup).toContain("Not fully known");
  });

  it("does not divide by zero revenue when displaying margins", () => {
    const period = { revenue: 0, cost: 0, profit: 0, unmappedItems: 0 };
    const markup = render({ earnings: { week: period, month: period } });
    expect(markup).not.toContain("Gross margin");
    expect(markup).not.toContain("Infinity");
    expect(markup).not.toContain("NaN");
  });

  it("keeps zero-order days at zero in a populated chart", () => {
    const markup = render({ series: [
      { date: "2026-09-07", label: "09-07", orders: 0, revenue: 0 },
      { date: "2026-09-08", label: "09-08", orders: 2, revenue: 20 },
    ] });
    expect(markup).toContain('style="height:0%"');
    expect(markup).toContain('style="height:100%"');
  });
});
