import path from "node:path";
import { expect, test as setup } from "@playwright/test";

/**
 * Sign the store's administrator in, once, for every case in `admin.spec.ts`.
 *
 * The session is obtained by driving the real `/ar/login` form with the
 * account the owner supplies through `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`.
 * That is the point: the login path a real person takes is exactly what gets
 * exercised, and nothing about it is stubbed. The resulting cookie jar is saved
 * to `.e2e/admin-state.json` (gitignored) and the `admin` project starts every
 * test from it.
 *
 * This project is only registered when both variables are set — see
 * `playwright.config.ts` — so on a machine with no account the whole admin
 * suite simply does not exist rather than failing.
 */
setup("sign in as the store's administrator", async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;

  expect(email, "E2E_ADMIN_EMAIL").toBeTruthy();
  expect(password, "E2E_ADMIN_PASSWORD").toBeTruthy();

  await page.goto("/ar/login", { waitUntil: "domcontentloaded" });

  await page.getByLabel("البريد الإلكتروني").fill(email!);
  await page.getByLabel("كلمة المرور").fill(password!);
  await page.getByRole("button", { name: "دخول" }).click();

  // The default redirect after signing in is the account page.
  await page.waitForURL("**/ar/profile");

  await page.context().storageState({ path: path.join(__dirname, "..", "..", ".e2e", "admin-state.json") });
});
