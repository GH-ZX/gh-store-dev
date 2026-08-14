# Signed-in and Administrator Browser Suite

**Date:** 2026-08-15
**Stage:** 12 (QA and Release)
**Status:** Approved

## Problem

The browser suite covers the anonymous storefront only. Every account and
admin journey — sign-in, the guard, the dashboard, its sub-pages, sign-out —
is unverified end to end. The ROADMAP defers these to the staging acceptance
run because they need a real account.

## Decision

Use the owner's existing administrator account, supplied through environment
variables, and obtain the session by driving the real Arabic sign-in form.
No service-role key reaches the test environment, and the actual login path is
what gets exercised.

- Credentials live in `.env.local` (already gitignored via `.env*`) as
  `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD`. They are never committed.
- A Playwright `globalSetup` signs in through `/ar/login` once and writes the
  authenticated cookie jar to a gitignored storage-state file
  (`.e2e/admin-state.json`).
- The `admin` project (desktop only) consumes that storage state, so every
  case in it starts already signed in.

Arabic is the primary locale, matching the rest of the suite.

## Coverage

### Sign-in (`admin.spec.ts`)

- Wrong password renders the invalid-credentials error, and the address stays
  on `/ar/login`.
- Correct credentials land on `/ar/profile` (the safe default redirect).

### Guard

- A signed-out visitor opening `/ar/dashboard` is redirected to
  `/ar/login?next=%2Far%2Fdashboard`. (Already asserted by `pages.spec.ts`;
  the admin spec re-checks the dashboard-specific redirect with the exact
  `next` value.)

### Dashboard renders

- Overview loads: the six stat cards and the dashboard nav are visible.
- The nav links cover the expected sections (catalog, customers, orders,
  payments, recharges, reviews, support, logs, providers, website).

### Breadth pass over dashboard pages

Same shape as `pages.spec.ts` but signed in: each admin page answers 200,
shows a first-level heading, throws nothing while hydrating, and does not
scroll sideways.

Pages: `/dashboard` (overview), `/dashboard/website`, `/dashboard/catalog`,
`/dashboard/customers`, `/dashboard/orders`, `/dashboard/payments`,
`/dashboard/recharges`, `/dashboard/reviews`, `/dashboard/support`,
`/dashboard/logs`, `/dashboard/providers`.

The website page additionally asserts the theme form renders its controls
(accent fields, mode select, backdrop select, presets) — the backdrop editor
landed recently and is the kind of thing a signed-in test should see.

### Sign-out

- Signing out from the dashboard returns to the storefront.

## Not in this pass

- **Non-admin signed-in denial** end to end: needs a customer account, which
  is a second fixture; the service and RLS layers are already covered by the
  unit suite (`tests/auth/guards.test.ts`).
- **Mutation of live data**: admin pages are asserted read-only. A change that
  writes to the store (e.g. editing a game) is deferred — this suite runs
  against the owner's real project, and a test that edits a catalog entry
  would leave the store changed.
- **Mobile admin**: the dashboard is a working surface used on a desktop.

## CI

Not in CI. CI has no Supabase project and must not hold administrator
credentials. When `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` are absent the
setup signs in nowhere, and the admin cases skip — so `pnpm test:e2e` keeps
working for the anonymous suite alone.

## Configuration changes

- `playwright.config.ts`: add a `setup-admin` project that runs only the
  global-setup logic, and an `admin` project (desktop, `channel: "chrome"`)
  with `storageState` pointing at the saved state and
  `dependencies: ["setup-admin"]`.
- `.gitignore`: add `.e2e/`.
- `.env.example`: document the two new optional variables.

## Rollout

1. Add `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` to `.env.local`.
2. Implement the setup + spec + config.
3. Run the full `pnpm test:e2e` locally against the dev server and confirm the
   admin cases pass.
4. `pnpm check`, then commit.
5. Owner rotates the administrator password afterwards, since it was shared in
   chat.
