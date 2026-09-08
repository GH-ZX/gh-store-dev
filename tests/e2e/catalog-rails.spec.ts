import { expect, test, type Locator } from "./fixtures";

// Anonymous catalog reads only. Reduced motion keeps boundary checks immediate
// while exercising the same native scroller used for touch and keyboard input.
test.use({ reducedMotion: "reduce" });

async function position(rail: Locator) {
  return rail.evaluate((list) => Math.abs(list.scrollLeft));
}

async function settleScroll(rail: Locator) {
  // Native snapping and its scroll event finish on animation frames, even
  // without smooth motion. Wait for that observable position to settle.
  await rail.evaluate((list) => new Promise<void>((resolve) => {
    let previous = list.scrollLeft;
    let stableFrames = 0;
    function measure() {
      stableFrames = Math.abs(list.scrollLeft - previous) < 0.1 ? stableFrames + 1 : 0;
      previous = list.scrollLeft;
      if (stableFrames >= 3) resolve(); else requestAnimationFrame(measure);
    }
    requestAnimationFrame(measure);
  }));
}

for (const locale of ["en", "ar"] as const) {
  test(`${locale}: product rail buttons follow reading direction and stop at actual boundaries`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/${locale}`, { waitUntil: "domcontentloaded" });
    const wrapper = page.locator(".sf-rail-with-controls").filter({ has: page.locator(".sf-product-rail") }).first();
    const rail = wrapper.getByRole("list");
    const previous = wrapper.getByRole("button", { name: locale === "ar" ? "المنتجات السابقة" : "Previous products", exact: true });
    const next = wrapper.getByRole("button", { name: locale === "ar" ? "المنتجات التالية" : "Next products", exact: true });
    await expect(next).toBeVisible();
    await expect(next).toBeEnabled();
    await expect(previous).toBeDisabled();
    await expect(rail).toHaveAttribute("tabindex", "0");
    await expect(next).toHaveAttribute("aria-controls", (await rail.getAttribute("id"))!);
    const buttonBox = await next.boundingBox();
    expect(buttonBox!.width).toBeGreaterThanOrEqual(44);
    expect(buttonBox!.height).toBeGreaterThanOrEqual(44);

    const first = rail.locator("li").first();
    const firstBefore = await first.evaluate((item) => item.getBoundingClientRect().x);
    await next.click();
    await settleScroll(rail);
    await expect.poll(() => position(rail)).toBeGreaterThan(80);
    const firstAfter = await first.evaluate((item) => item.getBoundingClientRect().x);
    expect(locale === "ar" ? firstAfter - firstBefore : firstBefore - firstAfter).toBeGreaterThan(80);
    await expect(previous).toBeEnabled();

    const maximumClicks = await rail.locator("li").count();
    const maximumPosition = await rail.evaluate((list) => list.scrollWidth - list.clientWidth);
    for (let clicks = 0; clicks < maximumClicks && await position(rail) < maximumPosition - 4; clicks += 1) {
      const before = await position(rail);
      await expect(next).toBeEnabled();
      await next.click();
      await settleScroll(rail);
      await expect.poll(() => position(rail)).toBeGreaterThan(before);
    }
    await expect(next).toBeDisabled();
    expect(await rail.evaluate((list) => list.scrollWidth - list.clientWidth - Math.abs(list.scrollLeft))).toBeLessThanOrEqual(4);

    for (let clicks = 0; clicks < maximumClicks && await position(rail) > 4; clicks += 1) {
      const before = await position(rail);
      await expect(previous).toBeEnabled();
      await previous.click();
      await settleScroll(rail);
      await expect.poll(() => position(rail)).toBeLessThan(before);
    }
    await expect(previous).toBeDisabled();
    expect(await position(rail)).toBeLessThanOrEqual(4);

    await rail.focus();
    await rail.press(locale === "ar" ? "ArrowLeft" : "ArrowRight");
    await expect.poll(() => position(rail)).toBeGreaterThan(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}
