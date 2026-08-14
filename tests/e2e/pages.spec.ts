import { expect, test } from "@playwright/test";

/**
 * Every public page, opened once.
 *
 * A breadth check rather than a depth one: `storefront.spec.ts` proves that
 * particular things work, and this proves that nothing is outright broken
 * anywhere — a page that throws while hydrating, a route that stopped
 * answering, a layout that runs off the side of a phone.
 *
 * Those three are what a person notices first and what a unit test cannot see.
 * They are also cheap: one navigation per page, no interaction, so the whole
 * suite is a few seconds against a warm dev server.
 *
 * Console output is deliberately not asserted. Catalog artwork comes from
 * supplier hosts this store does not control, and one of them answering 404
 * would fail every page here for a reason that is not this store's code. An
 * uncaught exception is different: that is always ours.
 */

/** Paths a visitor can reach without an account. */
const PUBLIC_PAGES = [
  "/ar",
  "/ar/games",
  "/ar/gift-cards",
  "/ar/sale",
  "/ar/search",
  "/ar/search?q=a",
  "/ar/faq",
  "/ar/how",
  "/ar/contact",
  "/ar/links",
  "/ar/privacy",
  "/ar/terms",
  "/ar/login",
  "/ar/forgot-password",
  "/en",
  "/en/games",
  "/en/search",
  "/en/contact",
];

/** Pages that belong to an account, and send a visitor to sign in. */
const PRIVATE_PAGES = ["/ar/wallet", "/ar/orders", "/ar/profile", "/ar/notifications", "/ar/support"];

for (const path of PUBLIC_PAGES) {
  test(`${path} answers, renders and fits`, async ({ page }) => {
    const errors: string[] = [];

    page.on("pageerror", (error) => errors.push(String(error)));

    const response = await page.goto(path, { waitUntil: "domcontentloaded" });

    expect(response?.status(), "HTTP status").toBe(200);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

    /*
     * Given time to hydrate before the check: an error thrown by a client
     * component surfaces after the document has already loaded, so asserting
     * immediately would pass on a page that breaks a moment later.
     */
    await page.waitForTimeout(1200);

    expect(errors, "uncaught client errors").toEqual([]);

    // A phone that scrolls sideways is the single most common RTL layout bug,
    // and it is invisible on a desktop viewport.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(1);
  });
}

for (const path of PRIVATE_PAGES) {
  test(`${path} sends a signed-out visitor to sign in`, async ({ page }) => {
    await page.goto(path, { waitUntil: "domcontentloaded" });

    expect(new URL(page.url()).pathname).toBe("/ar/login");
  });
}
