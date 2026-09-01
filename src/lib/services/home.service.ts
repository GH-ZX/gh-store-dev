import type { Locale } from "@/i18n/config";
import type { StoreProduct } from "@/lib/catalog/product-mapper";
import type { StoreOffer } from "@/lib/catalog/offer-mapper";
import type { HomeSection } from "@/lib/home/layout";
import { logFailure } from "@/lib/logging/logger";
import {
  getActiveProducts,
  getCarouselProducts,
  getProductsByCategories,
  getProductsByIds,
  getOffersByIds,
  getOffersByType,
  getSaleOffers,
  getSuggestedOffers,
  getTrendingOffers,
} from "@/lib/services/catalog.service";
import { getPublishedReviews, type StoreReview } from "@/lib/services/reviews.service";
import { getBinancePaymentOptions } from "@/lib/services/binance-recharge.service";
import { getSamPaymentOptions } from "@/lib/services/sam-recharge.service";
import type { SamMethod } from "@/lib/settings/sam-settings";

/**
 * Homepage section data.
 *
 * Sections are resolved concurrently and each read is isolated: one failing
 * section is dropped from the page rather than taking the homepage down with it.
 * A section that resolves to nothing is also dropped, so an admin enabling a
 * section before adding content does not leave an empty heading behind.
 */

export type ResolvedHomeSection =
  | { kind: "games"; section: HomeSection; games: StoreProduct[] }
  | { kind: "offers"; section: HomeSection; offers: StoreOffer[] }
  | { kind: "reviews"; section: HomeSection; reviews: StoreReview[] }
  | { kind: "social"; section: HomeSection }
  | {
      kind: "trust";
      section: HomeSection;
      /** The payment rails actually switched on, so the strip never promises one that is off. */
      payments: string[];
    }
  | { kind: "how"; section: HomeSection };

/** Featured products for the hero, resolved separately from the section list. */
export type HomeCarousel = {
  section: HomeSection | null;
  products: StoreProduct[];
};

/**
 * Read something for the home page, and let the page survive if it fails.
 *
 * A broken section must not take the storefront down — an empty row is a far
 * better outcome than an error page. But the section silently vanishing was the
 * only symptom, which made "why is the sale row gone?" unanswerable. The
 * fallback still happens; it is now recorded on the way past, named by section
 * so the log says which read failed rather than that one did.
 */
async function safely<T>(label: string, read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    logFailure("home", "home_section_unreadable", error, { section: label });

    return fallback;
  }
}

async function resolveSection(
  locale: Locale,
  section: HomeSection,
): Promise<ResolvedHomeSection | null> {
  switch (section.type) {
    case "trust_strip": {
      // The wallet is always there; the transfer rails depend on configuration.
      const [sam, binance] = await Promise.all([
        safely("trust_strip", () => getSamPaymentOptions(), {
          enabled: false,
          methods: [] as SamMethod[],
          invoiceCurrency: "USD",
          manualReview: false,
        }),
        safely("trust_strip", () => getBinancePaymentOptions(), { enabled: false, currency: "USD" }),
      ]);

      const payments = ["wallet"];

      if (sam.enabled) {
        payments.push(...sam.methods.map((method) => (method === "syriatel" ? "syriatel" : "shamcash")));
      }

      if (binance.enabled) {
        payments.push("binance");
      }

      return { kind: "trust", section, payments };
    }
    case "how_it_works":
      return { kind: "how", section };
    case "trending_offers": {
      const offers = await safely(
        section.type,
        () => getTrendingOffers(locale, section.limit),
        [],
      );
      return offers.length > 0 ? { kind: "offers", section, offers } : null;
    }
    case "games": {
      const games = await safely(section.type, () => getActiveProducts(locale, section.limit), []);
      return games.length > 0 ? { kind: "games", section, games } : null;
    }
    case "category": {
      const games = await safely(
        section.type,
        () => getProductsByCategories(locale, section.categoryIds, section.limit),
        [],
      );
      return games.length > 0 ? { kind: "games", section, games } : null;
    }
    case "product_picks": {
      const games = await safely(section.type, () => getProductsByIds(locale, section.productIds), []);
      return games.length > 0 ? { kind: "games", section, games } : null;
    }
    case "gift_cards": {
      const offers = await safely(
        section.type,
        () => getOffersByType(locale, "gift_card", section.limit),
        [],
      );
      return offers.length > 0 ? { kind: "offers", section, offers } : null;
    }
    case "sale_offers": {
      const offers = await safely(section.type, () => getSaleOffers(locale, section.limit), []);
      return offers.length > 0 ? { kind: "offers", section, offers } : null;
    }
    case "suggested_offers": {
      const offers = await safely(section.type, () => getSuggestedOffers(locale, section.limit), []);
      return offers.length > 0 ? { kind: "offers", section, offers } : null;
    }
    case "offer_picks": {
      const offers = await safely(section.type, () => getOffersByIds(locale, section.offerIds), []);
      return offers.length > 0 ? { kind: "offers", section, offers } : null;
    }
    case "customer_reviews": {
      const reviews = await safely(
        section.type,
        () => getPublishedReviews(locale, section.limit, section.reviewIds),
        [],
      );
      return reviews.length > 0 ? { kind: "reviews", section, reviews } : null;
    }
    case "social_links":
      // Its content lives in settings, so availability is passed in by the page.
      return { kind: "social", section };
    case "carousel":
      // Resolved by getHomeCarousel so the hero can render above the section list.
      return null;
  }
}

export type HomeSectionContext = {
  /** Whether store settings hold any social link to render. */
  hasSocialLinks: boolean;
};

export async function resolveHomeSections(
  locale: Locale,
  layout: HomeSection[],
  context: HomeSectionContext,
): Promise<ResolvedHomeSection[]> {
  const enabled = layout.filter((section) => {
    if (!section.enabled || section.type === "carousel") {
      return false;
    }

    // Drop the social section here rather than rendering nothing for it later:
    // the page decides between sections and a fallback by counting this list, so
    // a section that cannot render must not be counted.
    return section.type !== "social_links" || context.hasSocialLinks;
  });

  const resolved = await Promise.all(enabled.map((section) => resolveSection(locale, section)));

  return resolved.filter((section): section is ResolvedHomeSection => section !== null);
}

export async function getHomeCarousel(locale: Locale, layout: HomeSection[]): Promise<HomeCarousel> {
  const section = layout.find((candidate) => candidate.type === "carousel" && candidate.enabled) ?? null;

  if (!section) {
    return { section: null, products: [] };
  }

  return {
    section,
    products: await safely("carousel", () => getCarouselProducts(locale, section.limit), []),
  };
}
