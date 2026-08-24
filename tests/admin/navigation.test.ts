import { describe, expect, it } from "vitest";
import { DASHBOARD_NAV_GROUPS, isDashboardNavActive } from "@/lib/admin-dashboard/navigation";

describe("dashboard navigation groups", () => {
  it("orders groups the way an owner works", () => {
    const order = DASHBOARD_NAV_GROUPS.map((group) => group.key);
    expect(order).toEqual(["overview", "sales", "people", "storefront", "system"]);
  });

  it("keeps every expected page under its group", () => {
    const byGroup = Object.fromEntries(
      DASHBOARD_NAV_GROUPS.map((group) => [group.key, group.items.map((item) => item.key)]),
    );

    expect(byGroup.overview).toEqual(["overview"]);
    expect(byGroup.sales).toEqual(["orders", "payments", "recharges"]);
    expect(byGroup.people).toEqual(["customers", "support"]);
    expect(byGroup.storefront).toEqual(["games", "website", "appearance", "reviews"]);
    expect(byGroup.system).toEqual(["providers", "operations"]);
  });
});

describe("isDashboardNavActive", () => {
  const base = "/ar/dashboard";

  it("matches the root only when exactly on it", () => {
    expect(isDashboardNavActive(base, base, "/ar/dashboard")).toBe(true);
    expect(isDashboardNavActive(base, base, "/ar/dashboard/orders")).toBe(false);
  });

  it("matches a section and its children", () => {
    expect(isDashboardNavActive(base, `${base}/orders`, "/ar/dashboard/orders")).toBe(true);
    expect(isDashboardNavActive(base, `${base}/orders`, "/ar/dashboard/orders/1")).toBe(true);
    expect(isDashboardNavActive(base, `${base}/orders`, "/ar/dashboard/catalog")).toBe(false);
  });
});
