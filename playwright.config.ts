import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end checks against a running store.
 *
 * **The browser is the one already on the machine.** Every project sets
 * `channel: "chrome"`, so Playwright drives the installed Chrome instead of
 * downloading its own build — a few hundred megabytes that would otherwise have
 * to arrive before a single assertion could run. The trade is that these need a
 * Chrome present, which every machine this is developed on has.
 *
 * **Two viewports, two languages, every time.** Arabic is the primary locale and
 * a phone is the primary device, and both of those are exactly where this store
 * has broken before: a drawer that swallowed taps, a carousel that dragged the
 * wrong way under RTL. A suite that only proved the desktop English case would
 * have caught neither.
 *
 * The specs here are the anonymous storefront. Admin journeys need a real
 * administrator, and standing one up means writing to the project's auth — that
 * belongs to the staging acceptance run, not to a suite anybody can start.
 *
 * `webServer` starts `next dev` when nothing is already listening, and reuses a
 * server that is. Development builds are what these assert against deliberately:
 * they run while the change is being made, not only after a production build.
 */
const PORT = Number(process.env.E2E_PORT ?? 3000);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // These drive a real browser against a real database; the unit suite's
  // millisecond budget does not apply.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
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
      use: { ...devices["Pixel 7"], channel: "chrome" },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],

  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
