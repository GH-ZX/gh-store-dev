export type DashboardNavItem = {
  key: string;
  href?: string;
};

export type DashboardNavGroup = {
  key: string;
  items: DashboardNavItem[];
};

/**
 * The dashboard's one navigation definition.
 *
 * Both the desktop sidebar and the mobile group bar render from this array, so
 * a page added here appears everywhere and a reorder changes both at once.
 * Groups are ordered by how an owner works: money and support first, then the
 * catalogue, then settings.
 */
export const DASHBOARD_NAV_GROUPS: DashboardNavGroup[] = [
  { key: "overview", items: [{ key: "overview", href: "/" }] },
  {
    key: "operations",
    items: [
      { key: "orders", href: "/orders" },
      { key: "recharges", href: "/recharges" },
      { key: "payments", href: "/payments" },
      { key: "customers", href: "/customers" },
      { key: "support", href: "/support" },
    ],
  },
  {
    key: "catalog",
    items: [
      { key: "games", href: "/catalog" },
      { key: "website", href: "/website" },
      { key: "reviews", href: "/reviews" },
    ],
  },
  {
    key: "settings",
    items: [
      { key: "providers", href: "/providers" },
      { key: "operations", href: "/logs" },
    ],
  },
];

export function isDashboardNavActive(base: string, href: string, pathname: string): boolean {
  return href === base ? pathname === base : pathname === href || pathname.startsWith(`${href}/`);
}
