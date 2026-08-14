import { expect, test, type Page } from "@playwright/test";

/**
 * The storefront as a visitor meets it.
 *
 * Every case here is something that has actually broken: a document that
 * rendered LTR under Arabic, a carousel that advanced backwards because the
 * library was never told which way reading order runs, a card whose artwork was
 * not a link, a drawer that could not be opened. Unit tests could not have
 * caught any of them — they are all questions about a real browser.
 *
 * Anonymous only. Signing in needs an account, and creating one writes to the
 * project's auth; that belongs to the staging acceptance run.
 */

/**
 * Open the homepage and wait for the carousel to be *interactive*, not merely
 * painted.
 *
 * Waiting on the network is useless here — a dev server holds an HMR socket
 * open and never idles — and waiting on something visible is worse than
 * useless: the whole page server-renders, so every element a test could look
 * for is there long before a click does anything. Clicking then silently does
 * nothing, and the failure reads as a broken component.
 *
 * The honest signal is the carousel's own track: Embla writes a `translate3d`
 * onto it when it activates, and nothing else does. The controls are no use for
 * this — every one of them is server-rendered on purpose, so that a slow
 * connection gets a complete page rather than one that grows controls as it
 * loads.
 */
async function openHome(page: Page, locale: "ar" | "en") {
  await page.goto(`/${locale}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[aria-roledescription="carousel"]')).toBeVisible();
  await page.waitForFunction(() => {
    const track = document.querySelector('[aria-roledescription="slide"]')?.parentElement;

    return !!track && track.style.transform.includes("translate3d");
  });
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

test.describe("hero carousel", () => {
  test("a drag advances in reading order and never navigates", async ({ page }) => {
    for (const locale of ["ar", "en"] as const) {
      await openHome(page, locale);

      const markers = page.getByRole("button", { name: /انتقل إلى|Go to/ });

      // A store with one featured game has nothing to drag between.
      if ((await markers.count()) < 2) {
        test.skip(true, "fewer than two carousel slides in this catalog");
      }

      const selected = () =>
        markers.evaluateAll((items) =>
          items.findIndex((item) => item.getAttribute("aria-current") === "true"),
        );

      const before = await selected();
      const viewport = page.locator('[aria-roledescription="carousel"] .gh-sheen');
      const box = await viewport.boundingBox();

      expect(box).not.toBeNull();

      /*
       * "Next" is a finger moving right in Arabic and left in English: the next
       * slide sits on the side reading order runs towards, so the track has to
       * travel the other way to bring it in.
       */
      const from = locale === "ar" ? 0.2 : 0.8;
      const to = locale === "ar" ? 0.8 : 0.2;
      const y = box!.y + box!.height * 0.4;

      await page.mouse.move(box!.x + box!.width * from, y);
      await page.mouse.down();

      for (let step = 1; step <= 5; step += 1) {
        await page.mouse.move(box!.x + box!.width * (from + (to - from) * (step / 5)), y);
        await page.waitForTimeout(40);
      }

      await page.mouse.up();
      await page.waitForTimeout(1200);

      const count = await markers.count();

      expect(await selected()).toBe((before + 1) % count);
      // The whole slide is a link, so the drag guard is the only thing between a
      // swipe and a page nobody asked for.
      expect(new URL(page.url()).pathname).toBe(`/${locale}`);
    }
  });

  test("a logo button jumps to its game, and the artwork opens it", async ({ page }) => {
    await openHome(page, "ar");

    const markers = page.getByRole("button", { name: /انتقل إلى/ });

    if ((await markers.count()) < 2) {
      test.skip(true, "fewer than two carousel slides in this catalog");
    }

    await markers.nth(1).click();
    await expect(markers.nth(1)).toHaveAttribute("aria-current", "true");

    /*
     * `aria-current` moves when the slide is *selected*, which is at the start
     * of the scroll rather than the end. Measuring a slide that is still gliding
     * gives coordinates it has left by the time the click lands.
     */
    await page.waitForFunction(() => {
      const track = document.querySelector('[aria-roledescription="slide"]')?.parentElement;

      if (!track) {
        return false;
      }

      const settled = track.dataset.settledTransform === track.style.transform;

      track.dataset.settledTransform = track.style.transform;

      return settled;
    }, undefined, { polling: 250 });

    const slide = page.locator('[aria-roledescription="slide"][aria-hidden="false"] a').first();
    const box = await slide.boundingBox();

    expect(box).not.toBeNull();

    // The artwork, well away from the details pill at the bottom.
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height * 0.25);

    await expect(page).toHaveURL(/\/ar\/games\/[^/]+$/);
  });
});

test.describe("navigation", () => {
  test("the mobile drawer opens, and the closed one lets taps through", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "the drawer is a phone control");

    // Through the carousel's hydration signal, because a drawer that has not
    // hydrated does nothing when clicked and reads as a broken button.
    await openHome(page, "ar");

    /*
     * Located by its state rather than by its name, because the name is part of
     * what is being tested: the one trigger both opens and closes, so it is
     * "menu" while shut and "close" while open. A locator built on the name
     * would stop matching the moment it worked.
     */
    const menu = page.locator("header button[aria-expanded]").first();

    await expect(menu).toHaveAccessibleName("القائمة");

    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(menu).toHaveAccessibleName("إغلاق");
    await expect(page.getByRole("dialog", { name: "قائمة التنقل" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toHaveAccessibleName("القائمة");

    /*
     * And now the header still works. The overlay covers the whole viewport and
     * only stops taking pointer events when it is closed; when it did not, this
     * shortcut sat underneath doing nothing, which reads as a dead button
     * rather than as something invisible on top of it. Tested after the drawer
     * has been opened and closed, because that is the state it broke in.
     *
     * Exact, because the footer has a "البحث" link that a loose match also
     * finds — and the footer one is not under the overlay.
     */
    const search = page.getByRole("link", { name: "بحث", exact: true });

    await search.click();
    await expect(page).toHaveURL(/\/ar\/search$/);
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

test.describe("reduced motion", () => {
  test("the carousel does not rotate on its own", async ({ page }) => {
    // Set on the page rather than through `test.use`, so it is unambiguous that
    // it applies before the first navigation — the carousel decides whether to
    // register the autoplay plugin at all on its first render.
    await page.emulateMedia({ reducedMotion: "reduce" });

    await openHome(page, "ar");

    const markers = page.getByRole("button", { name: /انتقل إلى/ });

    if ((await markers.count()) < 2) {
      test.skip(true, "fewer than two carousel slides in this catalog");
    }

    const selected = () =>
      markers.evaluateAll((items) =>
        items.findIndex((item) => item.getAttribute("aria-current") === "true"),
      );

    const before = await selected();

    // Longer than the shortest interval an owner can configure, so a carousel
    // that rotates under this setting cannot slip through by being slow.
    await page.waitForTimeout(9000);

    expect(await selected()).toBe(before);
  });
});
