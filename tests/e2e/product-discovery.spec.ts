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

  test(`${locale}: campaign artwork loads and the opening has no horizontal overflow`, async ({ page }) => {
    await page.goto(`/${locale}`, { waitUntil: "domcontentloaded" });
    const artwork = page.locator(".sf-campaign-primary > img");
    await expect(artwork).toHaveAttribute("src", "/storefront/digital-essentials-v2.webp");
    await expect.poll(() => artwork.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator(".sf-campaign-cta")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
}
