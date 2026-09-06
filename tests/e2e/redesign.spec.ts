import { expect, test, type Page } from "@playwright/test";

// Anonymous, read-only checks complement the in-app visual review. Use the
// existing Playwright runner so both desktop and mobile execute every flow.
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

async function openHome(page: Page, locale: "ar" | "en") {
  const response = await page.goto(`/${locale}`, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.locator("[data-storefront-shell] .sf-campaigns")).toBeVisible();
  // Embla's transform is the existing suite's hydration signal. The configured
  // featured discovery carousel remains part of the redesigned homepage.
  await page.waitForFunction(() => document.querySelector('[aria-roledescription="slide"]')?.parentElement?.style.transform.includes("translate3d"));
}

async function expectFits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), "horizontal overflow in px").toBeLessThanOrEqual(1);
}

async function textContrast(page: Page) {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    function luminance(color: string) {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b] = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    function contrast(foreground: string, background: string) {
      const first = luminance(foreground), second = luminance(background);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    }
    const shell = getComputedStyle(document.querySelector("[data-storefront-shell]")!);
    const header = getComputedStyle(document.querySelector(".sf-site-header")!);
    const navigation = getComputedStyle(document.querySelector(".sf-category-link")!);
    const featured = getComputedStyle(document.querySelector(".sf-featured")!);
    const featuredDetails = getComputedStyle(document.querySelector(".sf-featured-details")!);
    return {
      body: contrast(shell.color, shell.backgroundColor),
      navigation: contrast(navigation.color, header.backgroundColor),
      featuredDetails: contrast(featuredDetails.color, featured.backgroundColor),
    };
  });
}

for (const locale of ["ar", "en"] as const) {
  test(`${locale} appearance remains readable and persists through reload`, async ({ page }, testInfo) => {
    await openHome(page, locale);
    for (const theme of ["light", "dark"] as const) {
      if (await page.locator("html").getAttribute("data-theme") !== theme) {
        await page.getByRole("button", { name: locale === "ar" ? "تغيير المظهر" : "Change appearance", exact: true }).click();
      }
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      // Persist with the actual control even if this was already the default.
      const toggle = page.getByRole("button", { name: locale === "ar" ? "تغيير المظهر" : "Change appearance", exact: true });
      if (await page.evaluate(() => localStorage.getItem("gh-store-theme")) !== theme) {
        await toggle.click();
        await toggle.click();
      }
      expect(await page.evaluate(() => localStorage.getItem("gh-store-theme"))).toBe(theme);
      await openHome(page, locale);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
      const contrast = await textContrast(page);
      expect(contrast.body, `${theme} body contrast`).toBeGreaterThanOrEqual(4.5);
      expect(contrast.navigation, `${theme} category navigation contrast`).toBeGreaterThanOrEqual(4.5);
      expect(contrast.featuredDetails, `${theme} featured details contrast`).toBeGreaterThanOrEqual(4.5);
      await expectFits(page);
      await page.screenshot({ path: `/tmp/gh-store-redesign-${testInfo.project.name}-${locale}-${theme}.png` });
    }
  });

  test(`${locale} campaign artwork and destinations work`, async ({ page }) => {
    await openHome(page, locale);
    const campaigns = page.locator(".sf-campaigns");
    await expect(campaigns.getByRole("link")).toHaveCount(3);
    await expect.poll(() => campaigns.locator("img").evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    const destinations = await campaigns.getByRole("link").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(destinations).toEqual([`/${locale}/products`, `/${locale}/ai`, `/${locale}/gift-cards`]);
    for (const destination of destinations) {
      const navigation = page.waitForResponse((response) => new URL(response.url()).pathname === `${destination}.data`);
      await campaigns.locator(`a[href="${destination}"]`).click();
      expect((await navigation).status(), `campaign destination ${destination}`).toBe(200);
      await expect(page).toHaveURL(new URL(destination!, page.url()).href);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await expectFits(page);
      await openHome(page, locale);
    }
  });

  test(`${locale} header search works after navigation and preserves its query across locales`, async ({ page, isMobile }) => {
    await openHome(page, locale);
    if (isMobile) {
      const menu = page.locator(".sf-menu-trigger");
      await menu.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      await expect(page.getByRole("dialog")).not.toBeVisible();
    }
    const search = page.locator(".sf-site-header [role=combobox]:visible");
    await expect(search).toHaveCount(1);
    await search.fill("steam");
    await search.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/${locale}/search\\?`));
    expect(new URL(page.url()).searchParams.get("q")).toBe("steam");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await page.locator(".sf-locale-control").click();
    const other = locale === "ar" ? "en" : "ar";
    await expect(page).toHaveURL(new RegExp(`/${other}/search\\?`));
    expect(new URL(page.url()).searchParams.get("q")).toBe("steam");
    await expect(page.locator("html")).toHaveAttribute("dir", other === "ar" ? "rtl" : "ltr");
    await expect(page.locator("html")).toHaveAttribute("lang", other);
    await expect(page.locator("[data-storefront-shell]").first()).toHaveAttribute("dir", other === "ar" ? "rtl" : "ltr");
    await expectFits(page);
  });
}
