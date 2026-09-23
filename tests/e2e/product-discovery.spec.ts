import { expect, test } from "./fixtures";

for (const locale of ["en", "ar"] as const) {
  test(`${locale}: category discovery leads to real catalog pages and preserves the full catalog route`, async ({ page }) => {
    await page.goto(`/${locale}`, { waitUntil: "domcontentloaded" });
    const discovery = page.locator(".sf-discovery");
    await expect(discovery).toBeVisible();
    const links = discovery.locator("li a");
    expect(await links.count()).toBeGreaterThan(0);
    expect(await links.count()).toBeLessThanOrEqual(8);
    await expect(discovery.locator(".sf-discovery-all")).toHaveAttribute("href", `/${locale}/products`);
    const destination = await links.first().getAttribute("href");
    await links.first().click();
    await expect(page).toHaveURL(new RegExp(`${destination}$`));
    await expect(page.locator("h1")).toBeVisible();
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
