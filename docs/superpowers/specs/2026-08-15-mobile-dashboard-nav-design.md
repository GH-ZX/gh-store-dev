# Mobile Dashboard Navigation

**Date:** 2026-08-15
**Stage:** 12 (QA and Release)
**Status:** Approved

## Problem

On phones the dashboard stacks the full sidebar card above the content, so an
owner scrolls past the entire navigation before reaching a page — every visit
starts with a wall of groups, and reaching "Orders" a second time costs another
scroll. The reference store (`echocore-store`) solves this with a compact tab
bar pinned under the header, and the owner asked for the same. While touching
the nav, the group order should also be revisited: daily money-and-support work
belongs before content.

## Decision

Give the dashboard two navigation shapes driven by one definition:

- **Desktop (`lg` and up):** the existing sidebar stays, unchanged in
  behaviour.
- **Mobile:** a sticky **group bar** under the header (four buttons, equal
  width, icon + short label, active group highlighted), with an iOS-style
  **segmented control** directly beneath showing the active group's pages.
  Picking a group swaps the segmented control to that group's pages.

The single `groups` array in `dashboard-nav.tsx` keeps driving both, reordered
so **Operations** precedes **Catalog**.

### Group order

| Position | Group | Pages |
|---|---|---|
| 1 | Overview | Home |
| 2 | Operations | Orders, Recharges, Payments, Customers, Support |
| 3 | Catalog | Games, Website, Reviews |
| 4 | Settings | Providers and API, Logs |

The existing `comingSoon` disabled-row behaviour (no `href`) is preserved in
the sidebar and simply skipped by the mobile subtabs.

## Implementation

### 1. `dashboard-nav.tsx` — one nav, two renderings

Extend `DashboardNav` so it renders:

- The current sidebar for `lg+` (`hidden lg:grid`).
- A new mobile group bar + subtabs for `md` and below (`lg:hidden`).

Both derive from the same `groups` structure. The mobile group bar is a sticky
row pinned just below the floating site header (`sticky top-[4.75rem] z-30`,
the header's `pt-3` + `min-h-16` bar ≈ 76px), so it stays reachable while a
long page scrolls; active group tinted with the accent, equal width, no
horizontal scroll needed for four entries. The subtabs are a segmented control:
one button per page in the active group, active page marked with the accent.

The "Back to the store" and sign-out controls stay in the sidebar and remain
desktop-only; on mobile the site header's own account menu already covers those
destinations.

### 2. Icons — extend `ui/icons.tsx`

Add stroke icons (1.5 at 24px, matching the house style) for pages and groups
that lack one:

- `GridIcon` — Overview group / Home page
- `PackageIcon` — Catalog group
- `GearIcon` — Settings group
- `ReceiptIcon` — Orders
- `DepositIcon` — Recharges (arrow into a tray)
- `CableIcon` — Providers and API
- `ScrollIcon` — Logs

Reused existing icons: `GamepadIcon` (Games), `GlobeIcon` (Website),
`StarIcon` (Reviews), `WalletIcon` (Payments), `UserIcon` (Customers),
`SupportIcon` (Support), `BoltIcon` (Operations group).

### 3. `dashboard/layout.tsx` — placement

Keep the sidebar `<aside>` visible only from `lg` up. The mobile nav renders
inside the dashboard shell, above `{children}`, so it is sticky under the site
header and on top of every dashboard page.

### 4. Messages

Add short labels for the mobile group bar (`groups.mobile` short labels) and
reuse existing `nav` page labels for the subtabs. Arabic translations included
for every new key.

## Scope and limits

- No route changes; every href is unchanged.
- The reorder affects both desktop and mobile (one definition).
- No new dashboard pages; the `comingSoon` entries remain placeholders.

## Verification

- `pnpm typecheck`, `pnpm lint`, `pnpm test`.
- Manual: on a narrow viewport, the group bar is sticky under the header, the
  segmented control shows the active group's pages, tapping a group swaps the
  subtabs, and tapping a sub page navigates with the correct active state.
  On desktop the sidebar renders the same groups in the new order.
