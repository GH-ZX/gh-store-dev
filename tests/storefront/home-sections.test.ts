import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeHomeLayout } from "@/lib/home/layout";
import { getHomeCarousel, resolveHomeSections } from "@server/lib/services/home.service";
import { getSaleOffers } from "@server/lib/services/home-catalog.service";

vi.mock("@server/lib/logging/logger", () => ({ logFailure: vi.fn() }));
vi.mock("@server/lib/services/sam-recharge.service", () => ({
  getSamPaymentOptions: vi.fn().mockResolvedValue({ enabled: true, methods: ["syriatel"], invoiceCurrency: "USD", manualReview: false }),
}));
vi.mock("@server/lib/services/binance-recharge.service", () => ({
  getBinancePaymentOptions: vi.fn().mockResolvedValue({ enabled: false, currency: "USD" }),
}));
vi.mock("@server/lib/services/home-catalog.service", () => ({
  getActiveProducts: vi.fn().mockResolvedValue([]),
  getCarouselProducts: vi.fn().mockResolvedValue([{ id: "hero" }]),
  getProductsByCategories: vi.fn().mockResolvedValue([]),
  getProductsByIds: vi.fn().mockResolvedValue([]),
  getOffersByIds: vi.fn().mockResolvedValue([]),
  getBestSellers: vi.fn().mockResolvedValue([]),
  getOffersByType: vi.fn().mockResolvedValue([]),
  getSaleOffers: vi.fn(),
  getTrendingOffers: vi.fn().mockResolvedValue([]),
}));

const client = {} as SupabaseClient;

describe("configured homepage rendering data", () => {
  it("isolates failed reads, drops empty sections, and excludes unrenderable social links", async () => {
    vi.mocked(getSaleOffers).mockRejectedValueOnce(new Error("upstream unavailable"));
    const layout = normalizeHomeLayout([
      { id: "hero", type: "carousel" },
      { id: "sale", type: "sale_offers" },
      { id: "empty", type: "games" },
      { id: "social", type: "social_links" },
      { id: "how", type: "how_it_works" },
      { id: "trust", type: "trust_strip" },
    ]);
    const sections = await resolveHomeSections(client, "en", layout, { hasSocialLinks: false });
    expect(sections.map((section) => section.kind)).toEqual(["how", "trust"]);
    expect(sections[1]).toMatchObject({ payments: ["wallet", "syriatel"] });
    expect(await getHomeCarousel(client, "en", layout)).toMatchObject({ section: { id: "hero" }, products: [{ id: "hero" }] });
  });

  it("honors disabled carousel and preserves configured social sections when links exist", async () => {
    const layout = normalizeHomeLayout([
      { id: "hero", type: "carousel", enabled: false },
      { id: "social", type: "social_links" },
    ]);
    expect(await getHomeCarousel(client, "ar", layout)).toEqual({ section: null, products: [] });
    expect(await resolveHomeSections(client, "ar", layout, { hasSocialLinks: true })).toEqual([
      { kind: "social", section: layout[1] },
    ]);
  });
});
