import { expect, test, type Page } from "./fixtures";

// Anonymous reads only. Controlled suggestions make focus/keyboard regression
// checks independent of stock changes; the results page uses the real loader.
const suggestions = {
  products: [
    { slug: "steam", categorySlug: "gift-cards", name: "Steam card" },
    { slug: "assistant", categorySlug: "ai", name: "AI subscription" },
  ],
  offers: [],
};

const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page), "uncaught client errors").toEqual([]);
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
});

function searchPanel(page: Page) {
  return page.locator(".sf-catalog-search-panel");
}

async function openSearch(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.locator(".sf-catalog-search-panel")).toBeVisible();
  // A harmless appearance toggle proves hydration before typing into a field.
  const theme = await page.locator("html").getAttribute("data-theme");
  await expect(async () => {
    await page.locator(".sf-header-actions .sf-control").filter({ has: page.locator(".gh-only-light") }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", theme ?? "", { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}

for (const locale of ["en", "ar"] as const) {
  test(`${locale} autocomplete stays dismissed after an in-flight response and supports reopening by keyboard`, async ({ page }, testInfo) => {
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/search/suggest?**", async (route) => {
      await held;
      await route.fulfill({ json: suggestions }).catch(() => {});
    });
    await openSearch(page, `/${locale}/search`);
    const field = searchPanel(page).getByRole("combobox");
    const request = page.waitForRequest((entry) => entry.url().includes("/api/search/suggest?"));
    await field.fill("steam");
    const pendingRequest = await request;
    const settled = Promise.race([
      page.waitForEvent("requestfinished", { predicate: (entry) => entry === pendingRequest }),
      page.waitForEvent("requestfailed", { predicate: (entry) => entry === pendingRequest }),
    ]);
    await field.press("Escape");
    release!();
    await settled;
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    await expect(field).toHaveValue("steam");
    await expect(field).toHaveAttribute("aria-expanded", "false");
    await expect(searchPanel(page).getByRole("listbox")).toHaveCount(0);

    // Focus reopens predictions, while ArrowUp reaches the last result.
    await field.blur();
    await field.focus();
    await expect(searchPanel(page).getByRole("option")).toHaveCount(2);
    await page.screenshot({ path: `/tmp/gh-search-${testInfo.project.name}-${locale}.png` });
    await field.press("ArrowUp");
    const last = searchPanel(page).getByRole("option").last();
    await expect(last).toHaveAttribute("aria-selected", "true");
    await expect(field).toHaveAttribute("aria-activedescendant", (await last.getAttribute("id"))!);
    await field.press("Escape");
    await expect(field).toHaveAttribute("aria-expanded", "false");
    await field.press("ArrowDown");
    await expect(searchPanel(page).getByRole("option").first()).toHaveAttribute("aria-selected", "true");

    await field.press("Tab");
    await expect(field).toHaveAttribute("aria-expanded", "false");
    await expect(searchPanel(page).getByRole("listbox")).toHaveCount(0);
  });

  test(`${locale} search buttons preserve the query and filter across results and language changes`, async ({ page }) => {
    await page.route("**/api/search/suggest?**", (route) => route.fulfill({ json: suggestions }));
    await openSearch(page, `/${locale}/search?type=gift_card`);
    const field = searchPanel(page).getByRole("combobox");
    const request = page.waitForRequest((entry) => entry.url().includes("/api/search/suggest?"));
    await field.fill("steam");
    expect(new URL((await request).url()).searchParams.get("type")).toBe("gift_card");
    await expect(searchPanel(page).getByRole("option")).toHaveCount(2);
    await field.press("ArrowDown");
    await searchPanel(page).locator('button[type="submit"]').click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/search\\?q=steam&type=gift_card$`));
    await expect(searchPanel(page).getByRole("combobox")).toHaveValue("steam");
    await expect(page.locator(".sf-site-header [role=combobox]:visible")).toHaveValue("steam");

    await page.locator(".sf-locale-control").click();
    const otherLocale = locale === "ar" ? "en" : "ar";
    await expect(page).toHaveURL(new RegExp(`/${otherLocale}/search\\?q=steam&type=gift_card$`));
    await expect(searchPanel(page).getByRole("combobox")).toHaveValue("steam");
    await expect(page.locator(".sf-site-header [role=combobox]:visible")).toHaveValue("steam");
    await expect(page.locator("html")).toHaveAttribute("dir", otherLocale === "ar" ? "rtl" : "ltr");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });

  test(`${locale} empty filtered search can recover without losing the query`, async ({ page }) => {
    const query = "no-matching-product-798256";
    await openSearch(page, `/${locale}/search?q=${query}&type=offers`);
    const recovery = page.getByRole("link", { name: locale === "en" ? "Search all types" : "البحث في جميع الأنواع", exact: true });
    await expect(recovery).toBeVisible();
    await recovery.click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/search\\?q=${query}$`));
    await expect(page.locator(".sf-catalog-search-filters [aria-current=true]")).toHaveText(locale === "en" ? "All" : "الكل");
    await expect(page.locator(".sf-search-results").getByRole("link", { name: locale === "en" ? "All products" : "جميع المنتجات", exact: true })).toHaveAttribute("href", `/${locale}/products`);
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  });
}
