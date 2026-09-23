import { expect, test, type Page } from "./fixtures";

/** Anonymous navigation checks; no customer or payment mutations. */
async function openHome(page: Page, locale: "ar" | "en") {
  await page.goto(`/${locale}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".sf-featured")).toBeVisible();
  await page.waitForFunction(() => Object.keys(document.querySelector(".sf-locale-control") ?? {}).some((key) => key.startsWith("__reactProps$")));
}

test.describe("document direction", () => {
  test("Arabic renders RTL and English LTR", async ({ page }) => {
    await page.goto("/ar", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");

    await page.goto("/en", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("an unprefixed path lands on the default locale", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    expect(new URL(page.url()).pathname).toBe("/ar");
  });

  test("the old singular game URL still resolves", async ({ page }) => {
    await openHome(page, "en");

    const firstGame = page.locator('a[href^="/en/games/"]').first();
    const href = await firstGame.getAttribute("href");
    const slug = href?.split("/").pop();

    expect(slug).toBeTruthy();

    await page.goto(`/en/game/${slug}`, { waitUntil: "domcontentloaded" });

    expect(new URL(page.url()).pathname).toBe(`/en/games/${slug}`);
  });
});

test.describe("featured products", () => {
  test("products stay available with reduced motion and keyboard navigation", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const locale of ["ar", "en"] as const) {
      await openHome(page, locale);
      const product = page.locator('.sf-featured-slide[aria-hidden="false"] .sf-featured-link').first();
      const destination = await product.getAttribute("href");
      await product.focus();
      await expect(product).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(new URL(destination!, page.url()).href);
      await expect(page.locator("h1")).toBeVisible();
    }
  });
});

test.describe("navigation", () => {
  test("the mobile drawer opens, and the closed one lets taps through", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "the drawer is a phone control");

    await openHome(page, "ar");

    const menu = page.locator(".sf-menu-trigger");

    await expect(menu).toHaveAccessibleName("القائمة");

    await menu.click();
    await expect(page.getByRole("dialog", { name: "قائمة التنقل" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(menu).toHaveAccessibleName("القائمة");

    /*
     * And now the header still works. The redesigned mobile header exposes the
     * search input directly instead of a search shortcut. Click and type after
     * closing the drawer to prove its overlay no longer intercepts touches.
     */
    const search = page.locator('header input[type="search"]:visible');

    await search.click();
    await expect(search).toBeFocused();
    await search.fill("steam");
    await search.press("Enter");
    await expect(page).toHaveURL(/\/ar\/search\?/);
    expect(new URL(page.url()).searchParams.get("q")).toBe("steam");
  });

  test("a game page answers, and a missing one answers 404", async ({ page }) => {
    await openHome(page, "ar");

    await page.locator('a[href^="/ar/games/"]').first().click();
    await expect(page).toHaveURL(/\/ar\/games\/[^/]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const missing = await page.goto("/ar/games/definitely-not-a-real-game", {
      waitUntil: "domcontentloaded",
    });

    expect(missing?.status()).toBe(404);
  });
});
