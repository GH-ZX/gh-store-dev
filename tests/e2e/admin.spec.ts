import { expect, test } from "@playwright/test";

/**
 * The store as its owner meets it.
 *
 * The counterpart to `storefront.spec.ts`: that suite proves what a visitor
 * sees, this one proves the account a visitor becomes. The session comes from
 * `admin.setup.ts`, which signed a real administrator in through the `/ar/login`
 * form; every test here starts already authenticated.
 *
 * Three of the cases need to start signed *out* — the login form itself, the
 * error it shows for a wrong password, and the guard that sends an anonymous
 * visitor away from the dashboard. They override the project's saved session
 * with an empty one, which is what an anonymous visitor would carry.
 *
 * Console output is deliberately not asserted, for the same reason as in
 * `pages.spec.ts`: supplier artwork hosts fail in ways this store does not
 * control. An uncaught exception is always ours.
 */

/** Start a case signed out, whatever the project's storageState says. */
const SIGNED_OUT = { cookies: [], origins: [] };

test.describe("the sign-in form", () => {
  test.use({ storageState: SIGNED_OUT });

  test("a wrong password shows an error and stays on the form", async ({ page }) => {
    await page.goto("/ar/login", { waitUntil: "domcontentloaded" });

    await page.getByLabel("البريد الإلكتروني").fill(process.env.E2E_ADMIN_EMAIL!);
    await page.getByLabel("كلمة المرور").fill("this-is-not-the-password");
    await page.getByRole("button", { name: "دخول" }).click();

    await expect(page.getByText("بيانات الدخول غير صحيحة.", { exact: true })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/ar/login");
  });

  test("the right credentials land on the account page", async ({ page }) => {
    await page.goto("/ar/login", { waitUntil: "domcontentloaded" });

    await page.getByLabel("البريد الإلكتروني").fill(process.env.E2E_ADMIN_EMAIL!);
    await page.getByLabel("كلمة المرور").fill(process.env.E2E_ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "دخول" }).click();

    await page.waitForURL("**/ar/profile");
  });
});

test.describe("the dashboard guard", () => {
  test.use({ storageState: SIGNED_OUT });

  test("a signed-out visitor is sent to sign in, carrying the return path", async ({ page }) => {
    await page.goto("/ar/dashboard", { waitUntil: "domcontentloaded" });

    const url = new URL(page.url());
    expect(url.pathname).toBe("/ar/login");
    expect(url.searchParams.get("next")).toBe("/ar/dashboard");
  });
});

test.describe("the dashboard overview", () => {
  test("renders its heading, stat cards and navigation", async ({ page }) => {
    await page.goto("/ar/dashboard", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { level: 1, name: "نظرة عامة" })).toBeVisible();

    // Two of the six labels are unique to the cards; the other four (الألعاب,
    // الباقات, الطلبات, الزبائن) are also the words of nav links, so asserting
    // them here would be ambiguous.
    await expect(page.getByText("ألعاب منشورة", { exact: true })).toBeVisible();
    await expect(page.getByText("باقات منشورة", { exact: true })).toBeVisible();

    const nav = page.getByRole("navigation", { name: "أقسام لوحة الإدارة" });
    for (const label of [
      "الرئيسية",
      "الألعاب",
      "الموقع والواجهة",
      "التقييمات",
      "الطلبات",
      "طلبات الشحن",
      "المدفوعات",
      "الزبائن",
      "الدعم",
      "الموردون والـ API",
      "السجلات",
    ]) {
      await expect(nav.getByRole("link", { name: label })).toBeVisible();
    }
  });
});

test.describe("the website settings", () => {
  test("the theme editor renders its controls", async ({ page }) => {
    await page.goto("/ar/dashboard/website", { waitUntil: "domcontentloaded" });

    const card = page.locator("section").filter({
      has: page.getByRole("heading", { level: 2, name: "المظهر" }),
    });

    // Ready-made accent pairs, drawn rather than named, each a press away.
    for (const preset of ["تركوازي", "نيلي", "زمردي", "بنفسجي", "جمري", "قرمزي", "رصاصي"]) {
      await expect(card.getByRole("button", { name: preset })).toBeVisible();
    }

    // The two colour fields, the mode select and the backdrop select.
    await expect(card.locator('input[name="accent"]')).toBeVisible();
    await expect(card.locator('input[name="accent_2"]')).toBeVisible();
    await expect(card.locator('select[name="default_mode"]')).toBeVisible();
    await expect(card.locator('select[name="backdrop"] option')).toHaveCount(4);

    await expect(card.getByRole("button", { name: "حفظ المظهر" })).toBeVisible();
  });
});

test.describe("the admin pages", () => {
  const ADMIN_PAGES = [
    "/ar/dashboard",
    "/ar/dashboard/website",
    "/ar/dashboard/catalog",
    "/ar/dashboard/customers",
    "/ar/dashboard/orders",
    "/ar/dashboard/payments",
    "/ar/dashboard/recharges",
    "/ar/dashboard/reviews",
    "/ar/dashboard/support",
    "/ar/dashboard/logs",
    "/ar/dashboard/providers",
  ];

  for (const path of ADMIN_PAGES) {
    test(`${path} answers, renders and fits`, async ({ page }) => {
      const errors: string[] = [];

      page.on("pageerror", (error) => errors.push(String(error)));

      const response = await page.goto(path, { waitUntil: "domcontentloaded" });

      expect(response?.status(), "HTTP status").toBe(200);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

      await page.waitForTimeout(1200);

      expect(errors, "uncaught client errors").toEqual([]);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );

      expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(1);
    });
  }
});

test.describe("signing out", () => {
  test("returns to the storefront", async ({ page }) => {
    await page.goto("/ar/dashboard", { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "تسجيل الخروج" }).click();

    await page.waitForURL("**/ar");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
