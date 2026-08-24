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
 * Groups are ordered by how an owner works: sell and get paid first, then the
 * people on the other side of those orders, then the storefront itself, then
 * the machinery underneath.
 */
export const DASHBOARD_NAV_GROUPS: DashboardNavGroup[] = [
  { key: "overview", items: [{ key: "overview", href: "/" }] },
  {
    key: "sales",
    items: [
      { key: "orders", href: "/orders" },
      { key: "payments", href: "/payments" },
      { key: "recharges", href: "/recharges" },
    ],
  },
  {
    key: "people",
    items: [
      { key: "customers", href: "/customers" },
      { key: "support", href: "/support" },
    ],
  },
  {
    key: "storefront",
    items: [
      { key: "games", href: "/catalog" },
      { key: "website", href: "/website" },
      { key: "appearance", href: "/appearance" },
      { key: "reviews", href: "/reviews" },
    ],
  },
  {
    key: "system",
    items: [
      { key: "providers", href: "/providers" },
      { key: "operations", href: "/logs" },
    ],
  },
];

export function isDashboardNavActive(base: string, href: string, pathname: string): boolean {
  return href === base ? pathname === base : pathname === href || pathname.startsWith(`${href}/`);
}
