import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DASHBOARD_NAV_GROUPS,
  isDashboardNavActive,
} from "../../storefront/app/lib/admin-dashboard/navigation";
import { AdminSidebar } from "../../storefront/app/components/admin/admin-sidebar";
import { AdminHeader } from "../../storefront/app/components/admin/admin-header";
import { AdminMobileDrawer } from "../../storefront/app/components/admin/admin-mobile-drawer";
import arAdmin from "../../storefront/app/i18n/messages/ar/admin.json";
import enAdmin from "../../storefront/app/i18n/messages/en/admin.json";

describe("admin workspace shell & navigation", () => {
  it("defines the standard 5 navigation groups in logical owner workflow order", () => {
    const groupKeys = DASHBOARD_NAV_GROUPS.map((g) => g.key);
    expect(groupKeys).toEqual(["overview", "sales", "people", "storefront", "system"]);
  });

  it("ensures all navigation groups and items have translations in both Arabic and English", () => {
    for (const group of DASHBOARD_NAV_GROUPS) {
      expect(arAdmin.shell.groups).toHaveProperty(group.key);
      expect(enAdmin.shell.groups).toHaveProperty(group.key);

      for (const item of group.items) {
        expect(arAdmin.shell.nav).toHaveProperty(item.key);
        expect(enAdmin.shell.nav).toHaveProperty(item.key);
      }
    }
  });

  it("accurately detects active navigation routes and isolates siblings", () => {
    const base = "/ar/dashboard";

    // Root overview page
    expect(isDashboardNavActive(base, base, "/ar/dashboard")).toBe(true);
    expect(isDashboardNavActive(base, base, "/ar/dashboard/orders")).toBe(false);

    // Section root
    expect(isDashboardNavActive(base, `${base}/orders`, "/ar/dashboard/orders")).toBe(true);

    // Section child / detail route
    expect(isDashboardNavActive(base, `${base}/orders`, "/ar/dashboard/orders/12345")).toBe(true);

    // Unrelated sibling section
    expect(isDashboardNavActive(base, `${base}/orders`, "/ar/dashboard/catalog")).toBe(false);
    expect(isDashboardNavActive(base, `${base}/catalog`, "/ar/dashboard/orders")).toBe(false);
  });

  it("exports all new admin workspace navigation components as callable functions", () => {
    expect(typeof AdminSidebar).toBe("function");
    expect(typeof AdminHeader).toBe("function");
    expect(typeof AdminMobileDrawer).toBe("function");
  });

  it("defines modern design tokens in admin-shell.css for dark and light modes", () => {
    const cssPath = resolve(__dirname, "../../storefront/app/styles/admin-shell.css");
    const css = readFileSync(cssPath, "utf-8");

    // Scoped under [data-admin-shell]
    expect(css).toContain("[data-admin-shell]");

    // Dark mode tokens (default)
    expect(css).toContain("--canvas: #101218;");
    expect(css).toContain("--surface: #191c25;");
    expect(css).toContain("--line: #2a2e3a;");
    expect(css).toContain("--accent: #5354ee;");

    // Light mode tokens
    expect(css).toContain('[data-theme="light"] [data-admin-shell]');
    expect(css).toContain("--canvas: #f5f6f8;");
    expect(css).toContain("--surface: #ffffff;");
    expect(css).toContain("--line: #e5e7ed;");
  });
});
