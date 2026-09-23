import { expect, test } from "./fixtures";

for (const locale of ["en", "ar"] as const) {
  test(`${locale}: homepage keeps category navigation in the header`, async ({ page }) => {
    await page.goto(`/${locale}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".sf-discovery")).toHaveCount(0);
    const headerNavigation = page.locator(".sf-category-nav");
    await expect(headerNavigation).toBeVisible();
    await expect(headerNavigation.locator(`a[href="/${locale}/products"]`)).toBeVisible();
    await expect(headerNavigation.locator(`a[href="/${locale}/games"]`)).toBeVisible();
    await expect(page.locator(".sf-product-card").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });

  test(`${locale}: products are visible in the first screen and open directly`, async ({ page }) => {
    await page.goto(`/${locale}`, { waitUntil: "domcontentloaded" });
    const product = page.locator(".sf-home-products .sf-product-card").first();
    await expect(product).toBeVisible();
    const box = await product.boundingBox();
    expect(box!.y).toBeLessThan(page.viewportSize()!.height - 120);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const href = await product.getAttribute("href");
    await product.click();
    await expect(page).toHaveURL(new URL(href!, page.url()).href);
    await expect(page.locator("h1")).toBeVisible();
  });
}
