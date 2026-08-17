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

test.describe("the dashboard navigation on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows a group bar and the active group's subtabs", async ({ page }) => {
    await page.goto("/ar/dashboard/orders", { waitUntil: "domcontentloaded" });

    // Group bar: the four groups, with Operations active. The group buttons are
    // plain links, so they answer to the link role.
    const groupBar = page.getByRole("navigation", { name: "أقسام لوحة الإدارة" }).first();
    await expect(groupBar).toBeVisible();
    await expect(groupBar.getByRole("link", { name: "العمليات" })).toHaveAttribute("aria-current", "page");

    // Subtabs: only the active group's pages. Each subtab carries an explicit
    // `role="tab"`, which replaces the implicit link role in the accessibility
    // tree, so they answer to the tab role — not the link role.
    await expect(groupBar.getByRole("tab", { name: "الطلبات" })).toHaveAttribute("aria-current", "page");
    await expect(groupBar.getByRole("tab", { name: "طلبات الشحن" })).toBeVisible();
    await expect(groupBar.getByRole("tab", { name: "المدفوعات" })).toBeVisible();
    await expect(groupBar.getByRole("tab", { name: "الزبائن" })).toBeVisible();
    await expect(groupBar.getByRole("tab", { name: "الدعم" })).toBeVisible();
    // Subtabs only ever belong to the active group, so a games subtab must not
    // exist while Operations is active. Queried as a tab: the subtabs carry an
    // explicit `role="tab"`, so the link role would never match them.
    await expect(groupBar.getByRole("tab", { name: "الألعاب" })).toHaveCount(0);
  });

  test("switching groups swaps the subtabs and navigates", async ({ page }) => {
    await page.goto("/ar/dashboard", { waitUntil: "domcontentloaded" });

    const groupBar = page.getByRole("navigation", { name: "أقسام لوحة الإدارة" }).first();

    // On the overview page only the overview subtab is rendered — the catalog
    // games subtab does not exist until the catalog group is active. The group
    // buttons are plain links named after the group label (الكتالوج).
    await groupBar.getByRole("link", { name: "الكتالوج" }).click();

    await expect(page).toHaveURL(/\/ar\/dashboard\/catalog$/);
    await expect(groupBar.getByRole("tab", { name: "الألعاب" })).toHaveAttribute("aria-selected", "true");
  });
});

/*
 * The site-name setting.
 *
 * The homepage tab is the owner's to name, so the configured name shows there
 * whether or not the switch is on; the switch is what spreads it to the
 * header, footer, and invoices. This case saves, asserts both states, and then
 * clears the value again — the setting persists in the real store settings,
 * and every other spec shares the same database.
 */
test.describe("the site name", () => {
  const ARABIC_NAME = "متجر الاختبار";
  const ENGLISH_NAME = "Test Store";
  const year = new Date().getFullYear();

  test("drives the homepage tab and, with the switch, the chrome", async ({ page }) => {
    // Save a configured name, switch off.
    await page.goto("/ar/dashboard/website", { waitUntil: "domcontentloaded" });
    // The field name is unique; the label text collides with the social links
    // editor's pet labels, so select by name.
    await page.locator('input[name="name_ar"]').fill(ARABIC_NAME);
    await page.locator('input[name="name_en"]').fill(ENGLISH_NAME);
    await page.getByRole("button", { name: "حفظ اسم المتجر" }).click();
    await expect(page.getByText("تم حفظ اسم المتجر.")).toBeVisible();

    // The homepage tab is the configured name alone — no "· GH Store" suffix,
    // because the homepage metadata reads it as an absolute title.
    await page.goto("/ar", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(ARABIC_NAME);

    // Switch off: the chrome keeps the built-in brand.
    await expect(page.getByRole("link", { name: "GH Store" }).first()).toBeVisible();

    // Turn the switch on: header and footer follow the configured name.
    await page.goto("/ar/dashboard/website", { waitUntil: "domcontentloaded" });
    await page.locator('input[name="use_everywhere"]').check();
    await page.getByRole("button", { name: "حفظ اسم المتجر" }).click();
    await expect(page.getByText("تم حفظ اسم المتجر.")).toBeVisible();

    await page.goto("/ar", { waitUntil: "domcontentloaded" });
    const brandLocator = page.getByRole("link", { name: ARABIC_NAME });
    await expect(brandLocator).toHaveCount(2);
    await expect(page.getByText(`© ${year} ${ARABIC_NAME}.`, { exact: false })).toBeVisible();

    // Back out: clearing the fields restores the built-in brand everywhere.
    await page.goto("/ar/dashboard/website", { waitUntil: "domcontentloaded" });
    await page.locator('input[name="name_ar"]').fill("");
    await page.locator('input[name="name_en"]').fill("");
    await page.locator('input[name="use_everywhere"]').uncheck();
    await page.getByRole("button", { name: "حفظ اسم المتجر" }).click();
    await expect(page.getByText("تم حفظ اسم المتجر.")).toBeVisible();

    await page.goto("/ar", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle("GH Store");
  });
});
