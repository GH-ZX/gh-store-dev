import { describe, expect, it } from "vitest";
import { legacyProductRedirect } from "../../storefront/workers/request-policy";

describe("legacy product bookmarks", () => {
  it.each([
    ["/game/example", "/ar/games/example"],
    ["/game/example/offer?ref=shared", "/ar/games/example/offer?ref=shared"],
    ["/en/game/example", "/en/games/example"],
    ["/ar/game/example/offer", "/ar/games/example/offer"],
    ["/ar/games-instant-recharge", "/ar/games"],
    ["/en/games-vouchers", "/en/vouchers"],
    ["/ar/games-vouchers/pubg-mobile-uc-vouchers", "/ar/vouchers/pubg-mobile-uc-vouchers"],
    ["/en/gift-cards-codes/psn-turkey", "/en/vouchers/psn-turkey"],
  ])("redirects %s in one hop", (path, destination) => {
    expect(legacyProductRedirect(new Request(`https://store.example${path}`))?.href).toBe(`https://store.example${destination}`);
  });
  it.each(["/en/ai/example", "/ar/games/example", "/en/vouchers/pubg-mobile-uc-vouchers", "/game", "/api/game/example"])("keeps current route %s", path => {
    expect(legacyProductRedirect(new Request(`https://store.example${path}`))).toBeNull();
  });
});
