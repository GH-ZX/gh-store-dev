import { describe, expect, it } from "vitest";
import { DASHBOARD_NAV_GROUPS, isDashboardNavActive } from "@/lib/admin-dashboard/navigation";

describe("dashboard navigation groups", () => {
  it("orders operations before catalog", () => {
    const order = DASHBOARD_NAV_GROUPS.map((group) => group.key);
    expect(order).toEqual(["overview", "operations", "catalog", "settings"]);
  });

  it("keeps every expected page under its group", () => {
    const byGroup = Object.fromEntries(
      DASHBOARD_NAV_GROUPS.map((group) => [group.key, group.items.map((item) => item.key)]),
    );

    expect(byGroup.overview).toEqual(["overview"]);
    expect(byGroup.operations).toEqual(["orders", "recharges", "payments", "customers", "support"]);
    expect(byGroup.catalog).toEqual(["games", "website", "reviews"]);
    expect(byGroup.settings).toEqual(["providers", "operations"]);
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
