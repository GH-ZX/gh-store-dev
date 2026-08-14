# Mobile Dashboard Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the dashboard a mobile navigation (sticky group bar + segmented subtabs under the header) driven by the same nav definition as the desktop sidebar, reordered so Operations precedes Catalog.

**Architecture:** Extract the dashboard navigation groups and the active-path check into a pure `navigation.ts` module (unit-testable). Extend `DashboardNav` into two renderings of that one definition: the existing sidebar for `lg+`, and a sticky group bar plus subtabs for `md` and below. The dashboard layout shows the sidebar only from `lg`, rendering the mobile nav above the page content.

**Tech Stack:** Next.js App Router (server + client components), React 19, Tailwind CSS 4, TypeScript 5.9, Vitest 4, Playwright.

## Global Constraints

- House icon style: 24×24 grid, `fill="none"`, `stroke="currentColor"`, `strokeWidth={1.5}`, `aria-hidden="true"`, inherits `currentColor`. See `src/components/ui/icons.tsx`.
- One nav definition drives both desktop and mobile — no second copy of the groups.
- Reorder only: Overview, **Operations** (orders, recharges, payments, customers, support), **Catalog** (games, website, reviews), **Settings** (providers, logs).
- No route changes; every `href` is unchanged.
- All new strings need matching Arabic and English keys (Arabic is the structural source of truth in `src/i18n/messages.ts`).
- Verify with `pnpm typecheck`, `pnpm lint`, `pnpm test`. E2E needs `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` (runs only when set).

---

### Task 1: Navigation data module with reorder

**Files:**
- Create: `src/lib/admin-dashboard/navigation.ts`
- Create: `tests/admin/navigation.test.ts`

**Interfaces:**
- Produces:
  - `export type DashboardNavItem = { key: string; href?: string }`
  - `export type DashboardNavGroup = { key: string; items: DashboardNavItem[] }`
  - `export const DASHBOARD_NAV_GROUPS: DashboardNavGroup[]` — groups in the new order: `overview`, `operations`, `catalog`, `settings`.
  - `export function isDashboardNavActive(base: string, href: string, pathname: string): boolean` — `href === base` matches only `pathname === base`; any other `href` matches `pathname === href || pathname.startsWith(href + "/")`.

- [ ] **Step 1: Write the failing tests**

Create `tests/admin/navigation.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- tests/admin/navigation.test.ts`
Expected: FAIL — module and functions do not exist.

- [ ] **Step 3: Write the module**

Create `src/lib/admin-dashboard/navigation.ts`:

```ts
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
```

Note: `href` values are relative to `base`; the consumer builds absolute hrefs (`base + item.href`) and passes `base + "/"` resolved paths to `isDashboardNavActive`. The root item's `href: "/"` maps to `base` exactly.

> **Spec simplification:** the approved spec asked for short group labels (`groups.mobile`). The existing `groups` labels are already brief — the longest Arabic group label is "نظرة عامة" (9 chars) — and truncate gracefully in the 4-column bar, so no duplicate short-label message keys are added. If a future group label outgrows the bar, add a `groups.mobile` map then.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- tests/admin/navigation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-dashboard/navigation.ts tests/admin/navigation.test.ts
git commit -m "feat: extract dashboard navigation data and active check"
```

---

### Task 2: New stroke icons

**Files:**
- Modify: `src/components/ui/icons.tsx`

**Interfaces:**
- Consumes: the existing `Icon` wrapper (exported internally in the same file, `function Icon`).
- Produces (all `(props: IconProps) => JSX.Element`, matching existing exports): `GridIcon`, `PackageIcon`, `GearIcon`, `ReceiptIcon`, `DepositIcon`, `CableIcon`, `ScrollIcon`.

Reused icons already present: `GamepadIcon`, `GlobeIcon`, `StarIcon`, `WalletIcon`, `UserIcon`, `SupportIcon`, `BoltIcon`.

- [ ] **Step 1: Add the icons**

Append to `src/components/ui/icons.tsx` (before the final `ButtonIcon`/closing of the file), one block per icon, matching the 1.5-stroke style:

```tsx
export function GridIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </Icon>
  );
}

export function PackageIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m3.5 7.5 8.5-4 8.5 4v9l-8.5 4-8.5-4Z" />
      <path d="m3.5 7.5 8.5 4 8.5-4" />
      <path d="M12 11.5v9" />
    </Icon>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9 19 19M19 5l-2.1 2.1M7.1 16.9 5 19" />
    </Icon>
  );
}

export function ReceiptIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.5 3.5h13v17l-2.17-1.5L14 20.5l-2-1.5-2 1.5-2.33-1.5L5.5 20.5Z" />
      <path d="M9 8.5h6M9 12h6M9 15.5h4" />
    </Icon>
  );
}

export function DepositIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4v9M8.5 9.5 12 13l3.5-3.5" />
      <path d="M4 15.5v2A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5v-2" />
    </Icon>
  );
}

export function CableIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.5 3.5v5a5.5 5.5 0 0 0 11 0v-5" />
      <path d="M12 14v6M9.5 20h5" />
    </Icon>
  );
}

export function ScrollIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.5 3.5h11v17l-2.75-2-2.75 2-2.75-2L6.5 20.5Z" />
      <path d="M9.5 8h5M9.5 11.5h5M9.5 15h3" />
    </Icon>
  );
}
```

- [ ] **Step 2: Verify with typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/icons.tsx
git commit -m "feat: add dashboard navigation icons"
```

---

### Task 3: DashboardNav renders both shapes; layout places them

**Files:**
- Modify: `src/components/admin/dashboard-nav.tsx` (whole file)
- Modify: `src/app/[locale]/dashboard/layout.tsx:47-81`

**Interfaces:**
- Consumes: `DASHBOARD_NAV_GROUPS`, `isDashboardNavActive` (Task 1); icons from Task 2; `AdminMessages["shell"]` (existing).
- Produces: `DashboardNav({ locale, messages, variant }: { locale: Locale; messages: AdminMessages["shell"]; variant: "sidebar" | "mobile" })` — renders the desktop sidebar when `variant === "sidebar"`, or the mobile group bar + subtabs when `variant === "mobile"`.

Icon map inside `dashboard-nav.tsx` (group key → icon, page key → icon), reusing Task 1 keys:

```ts
const GROUP_ICONS: Record<string, IconType> = {
  overview: GridIcon,
  operations: BoltIcon,
  catalog: PackageIcon,
  settings: GearIcon,
};

const PAGE_ICONS: Record<string, IconType> = {
  overview: GridIcon,
  games: GamepadIcon,
  website: GlobeIcon,
  reviews: StarIcon,
  orders: ReceiptIcon,
  recharges: DepositIcon,
  payments: WalletIcon,
  customers: UserIcon,
  support: SupportIcon,
  providers: CableIcon,
  operations: ScrollIcon,
};
```

Where `IconType = (props: IconProps) => JSX.Element`, imported from `@/components/ui/icons`.

- [ ] **Step 1: Rewrite the navigation module and component**

Replace the contents of `src/components/admin/dashboard-nav.tsx` with the following. It drops the local groups array and the local `isActive` in favour of the shared module, keeps the `comingSoon` handling for href-less items in the sidebar, and adds the mobile rendering.

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement, SVGProps } from "react";
import { Badge } from "@/components/ui/badge";
import {
  CableIcon,
  DepositIcon,
  GamepadIcon,
  GearIcon,
  GlobeIcon,
  GridIcon,
  PackageIcon,
  ReceiptIcon,
  ScrollIcon,
  StarIcon,
  SupportIcon,
  UserIcon,
  WalletIcon,
  BoltIcon,
} from "@/components/ui/icons";
import { DASHBOARD_NAV_GROUPS, isDashboardNavActive } from "@/lib/admin-dashboard/navigation";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import { cn } from "@/lib/cn";

type IconType = (props: SVGProps<SVGSVGElement>) => ReactElement;

const GROUP_ICONS: Record<string, IconType> = {
  overview: GridIcon,
  operations: BoltIcon,
  catalog: PackageIcon,
  settings: GearIcon,
};

const PAGE_ICONS: Record<string, IconType> = {
  overview: GridIcon,
  games: GamepadIcon,
  website: GlobeIcon,
  reviews: StarIcon,
  orders: ReceiptIcon,
  recharges: DepositIcon,
  payments: WalletIcon,
  customers: UserIcon,
  support: SupportIcon,
  providers: CableIcon,
  operations: ScrollIcon,
};

/**
 * Dashboard navigation, one definition two shapes.
 *
 * `variant === "sidebar"` is the desktop group-and-list on the left; below `lg`
 * that sidebar is hidden and `variant === "mobile"` renders a sticky bar of the
 * four groups under the site header, with a segmented control beneath showing
 * the active group's pages. Both read the same {@link DASHBOARD_NAV_GROUPS}, so
 * a reorder or a new page shows up in both places.
 */
export type DashboardNavProps = {
  locale: Locale;
  messages: AdminMessages["shell"];
  variant: "sidebar" | "mobile";
};

export function DashboardNav({ locale, messages, variant }: DashboardNavProps) {
  const pathname = usePathname() ?? "";
  const base = `/${locale}/dashboard`;
  const groups = DASHBOARD_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      href: item.href === "/" ? base : item.href ? `${base}${item.href}` : undefined,
    })),
  }));

  function isActive(href: string): boolean {
    return isDashboardNavActive(base, href, pathname);
  }

  if (variant === "mobile") {
    const activeGroup = groups.find((group) => group.items.some((item) => item.href && isActive(item.href)));

    return (
      <div className="lg:hidden">
        <nav aria-label={messages.navLabel} className="sticky top-[4.75rem] z-30 -mx-2 px-2 sm:top-[5.25rem]">
          <div className="grid grid-cols-4 gap-1.5 rounded-[var(--radius-card)] border border-[var(--line)] bg-[color-mix(in_srgb,var(--shell)_88%,transparent)] p-1.5 shadow-[var(--elevation-2)] backdrop-blur-xl">
            {groups.map((group) => {
              const Icon = GROUP_ICONS[group.key] ?? GridIcon;
              const isGroupActive = group === activeGroup;
              const hasHref = group.items.some((item) => item.href);

              return (
                <Link
                  key={group.key}
                  href={hasHref ? (group.items.find((item) => item.href)?.href ?? base) : base}
                  aria-current={isGroupActive ? "page" : undefined}
                  className={cn(
                    "flex min-w-0 flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] px-1 py-2 text-center transition-colors duration-[var(--duration)]",
                    isGroupActive
                      ? "bg-[var(--surface-strong)] text-[var(--ink)]"
                      : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
                  )}
                >
                  <Icon className="size-5 shrink-0" />
                  <span className="max-w-full truncate text-[0.6875rem] font-semibold leading-none">
                    {messages.groups[group.key as keyof AdminMessages["shell"]["groups"]]}
                  </span>
                </Link>
              );
            })}
          </div>

          {activeGroup && activeGroup.items.some((item) => item.href) ? (
            <div
              role="tablist"
              aria-label={messages.groups[activeGroup.key as keyof AdminMessages["shell"]["groups"]]}
              className="mt-2 grid gap-1 rounded-[var(--radius-card)] border border-[var(--line)] bg-[color-mix(in_srgb,var(--shell)_88%,transparent)] p-1 shadow-[var(--elevation-1)] backdrop-blur-xl"
              style={{ gridTemplateColumns: `repeat(${activeGroup.items.filter((item) => item.href).length}, minmax(0, 1fr))` }}
            >
              {activeGroup.items.map((item) => {
                if (!item.href) {
                  return null;
                }

                const Icon = PAGE_ICONS[item.key] ?? GridIcon;
                const current = isActive(item.href);

                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    role="tab"
                    aria-selected={current}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "flex min-w-0 flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] px-1 py-2 text-center transition-colors duration-[var(--duration)]",
                      current
                        ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                        : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="max-w-full truncate text-[0.625rem] font-semibold leading-none">
                      {messages.nav[item.key as keyof AdminMessages["shell"]["nav"]]}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : null}
        </nav>
      </div>
    );
  }

  return (
    <nav aria-label={messages.navLabel} className="grid gap-6">
      {groups.map((group) => (
        <div key={group.key}>
          <h2 className="px-3 text-[0.6875rem] font-semibold tracking-[0.14em] text-[var(--ink-faint)] uppercase">
            {messages.groups[group.key as keyof AdminMessages["shell"]["groups"]]}
          </h2>
          <ul className="mt-2 grid gap-0.5">
            {group.items.map((item) => {
              const label = messages.nav[item.key as keyof AdminMessages["shell"]["nav"]];

              if (!item.href) {
                return (
                  <li
                    key={item.key}
                    className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] px-3 py-2.5 text-sm text-[var(--ink-faint)]"
                  >
                    <span>{label}</span>
                    <Badge tone="neutral" className="shrink-0 text-[0.625rem]">
                      {messages.comingSoon}
                    </Badge>
                  </li>
                );
              }

              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    className={cn(
                      "block rounded-[var(--radius-control)] px-3 py-2.5 text-sm transition-colors duration-[var(--duration)]",
                      isActive(item.href)
                        ? "bg-[var(--surface-strong)] font-semibold text-[var(--ink)]"
                        : "text-[var(--ink-soft)] hover:bg-[var(--shell)] hover:text-[var(--ink)]",
                    )}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: Place both renderings in the layout**

Modify `src/app/[locale]/dashboard/layout.tsx`:

1. Import `DashboardNav` already there. Change the `<aside>` wrapper to show only from `lg` up, and render the sidebar nav inside it:

```tsx
<aside className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
  <div className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-4">
    <div className="flex items-center justify-between gap-2 px-3 pb-4">
      <span className="text-sm font-semibold text-[var(--ink)]">{messages.shell.title}</span>
    </div>

    <DashboardNav locale={locale} messages={messages.shell} variant="sidebar" />

    {/* back-to-store + sign-out, unchanged */}
  </div>
</aside>
```

2. Render the mobile nav above the page content, inside the main column:

```tsx
<div className="min-w-0">
  <DashboardNav locale={locale} messages={messages.shell} variant="mobile" />
  {children}
</div>
```

Keep `data-dashboard-shell`, the outer grid, and the `gh-page` wrapper as they are.

- [ ] **Step 3: Verify with typecheck, lint, and unit tests**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/dashboard-nav.tsx "src/app/[locale]/dashboard/layout.tsx"
git commit -m "feat: mobile dashboard nav with group bar and subtabs"
```

---

### Task 4: Mobile dashboard nav E2E

**Files:**
- Modify: `tests/e2e/admin.spec.ts` (add a describe block; file currently 163 lines)

**Interfaces:**
- Consumes: existing `test`, `expect` from `@playwright/test`; the running store at `BASE_URL`; the admin session from the `setup-admin` storage state.

- [ ] **Step 1: Write the failing test**

Append to `tests/e2e/admin.spec.ts`:

```ts
test.describe("the dashboard navigation on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows a group bar and the active group's subtabs", async ({ page }) => {
    await page.goto("/ar/dashboard/orders", { waitUntil: "domcontentloaded" });

    // Group bar: the four groups, with Operations active.
    const groupBar = page.getByRole("navigation", { name: "أقسام لوحة الإدارة" }).first();
    await expect(groupBar).toBeVisible();
    await expect(groupBar.getByRole("link", { name: "العمليات" })).toHaveAttribute("aria-current", "page");

    // Subtabs: only the active group's pages.
    await expect(groupBar.getByRole("link", { name: "الطلبات" })).toHaveAttribute("aria-current", "page");
    await expect(groupBar.getByRole("link", { name: "طلبات الشحن" })).toBeVisible();
    await expect(groupBar.getByRole("link", { name: "المدفوعات" })).toBeVisible();
    await expect(groupBar.getByRole("link", { name: "الزبائن" })).toBeVisible();
    await expect(groupBar.getByRole("link", { name: "الدعم" })).toBeVisible();
    await expect(groupBar.getByRole("link", { name: "الألعاب" })).toHaveCount(0);
  });

  test("switching groups swaps the subtabs and navigates", async ({ page }) => {
    await page.goto("/ar/dashboard", { waitUntil: "domcontentloaded" });

    const groupBar = page.getByRole("navigation", { name: "أقسام لوحة الإدارة" }).first();
    await groupBar.getByRole("link", { name: "الألعاب" }).click();

    await expect(page).toHaveURL(/\/ar\/dashboard\/catalog$/);
    await expect(groupBar.getByRole("link", { name: "الألعاب" })).toHaveAttribute("aria-current", "page");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails (or confirms the current stacked layout)**

Run: `pnpm test:e2e -- tests/e2e/admin.spec.ts`
Expected: either the assertions fail against the current stacked sidebar (no group bar), or pass already — both are acceptable signals; the suite is the regression guard for the new nav.

- [ ] **Step 3: Run the whole admin spec to confirm no regressions**

Run: `pnpm test:e2e -- tests/e2e/admin.spec.ts`
Expected: the pre-existing desktop overview/nav test still passes (it asserts links exist, not their order), and the new mobile tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/admin.spec.ts
git commit -m "test: cover the mobile dashboard navigation"
```

---

## Final verification

- [ ] Run `pnpm typecheck` — passes.
- [ ] Run `pnpm lint` — passes.
- [ ] Run `pnpm test` — passes (40 files, 418+ tests).
- [ ] If `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` are set, run `pnpm test:e2e -- tests/e2e/admin.spec.ts` — passes.
- [ ] Manual (optional): narrow viewport — group bar is sticky under the header, tapping a group swaps subtabs, tapping a subtab navigates with correct active state; desktop shows the sidebar in the new group order.
