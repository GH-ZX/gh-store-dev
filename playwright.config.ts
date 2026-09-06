import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

/**
 * End-to-end checks against a running store.
 *
 * **The browser is explicit and reproducible.** By default projects use
 * Playwright's bundled Chromium, so CI and a clean development container can run
 * the suite without relying on a system Chrome installation. Set
 * `PLAYWRIGHT_BROWSER_CHANNEL=chrome` when an installed Chrome is preferred.
 *
 * **Two viewports, two languages, every time.** Arabic is the primary locale and
 * a phone is the primary device, and both of those are exactly where this store
 * has broken before: a drawer that swallowed taps, a carousel that dragged the
 * wrong way under RTL. A suite that only proved the desktop English case would
 * have caught neither.
 *
 * **The anonymous storefront, plus the administrator.** `mobile` and `desktop`
 * run the visitor suite; `setup-admin` signs an owner's account in through the
 * real `/ar/login` form and saves the session, and `admin` — desktop only, a
 * working surface — reuses it. The two admin projects exist only when
 * `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` are set, so a machine or CI
 * without an account still runs the anonymous suite untouched.
 *
 * `webServer` starts the React Router dev server when nothing is already listening, and reuses a
 * server that is. Development builds are what these assert against deliberately:
 * they run while the change is being made, not only after a production build.
 */

/*
 * Load local test credentials and Playwright options from `.env.local`.
 * Worker application bindings belong in `storefront/.dev.vars`; loading this
 * file does not override Wrangler's bindings. `loadEnvFile` preserves exported
 * environment values. The file is absent on CI, hence the guard.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // No local env file; the anonymous suite needs nothing from it.
}

const PORT = Number(process.env.E2E_PORT ?? 5173);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

const hasAdminCredentials = Boolean(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD);
const BROWSER_CHANNEL = process.env.PLAYWRIGHT_BROWSER_CHANNEL as "chrome" | undefined;
const ADMIN_STATE = path.join(__dirname, ".e2e", "admin-state.json");

export default defineConfig({
  testDir: "./tests/e2e",
  // These drive a real browser against a real database; the unit suite's
  // millisecond budget does not apply.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: BASE_URL,
    // Kept only for a failure: a passing run should leave nothing behind.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], channel: BROWSER_CHANNEL },
      testIgnore: /admin\.(setup|spec)\.ts/,
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], channel: BROWSER_CHANNEL },
      testIgnore: /admin\.(setup|spec)\.ts/,
    },
    ...(hasAdminCredentials
      ? [
          {
            name: "setup-admin",
            testMatch: /admin\.setup\.ts/,
            use: { ...devices["Desktop Chrome"], channel: BROWSER_CHANNEL },
          },
          {
            name: "admin",
            testMatch: /admin\.spec\.ts/,
            dependencies: ["setup-admin"],
            use: {
              ...devices["Desktop Chrome"],
              channel: BROWSER_CHANNEL,
              storageState: ADMIN_STATE,
            },
          },
        ]
      : []),
  ],

  webServer: {
    command: `pnpm dev --host 127.0.0.1 --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
