import type { Locale } from "@/i18n/config";
import type { StoreGame } from "@/lib/catalog/game-mapper";
import type { StoreOffer } from "@/lib/catalog/offer-mapper";
import type { HomeSection } from "@/lib/home/layout";
import { logFailure } from "@/lib/logging/logger";
import {
  getActiveGames,
  getCarouselGames,
  getGamesByIds,
  getOffersByIds,
  getOffersByType,
  getSaleOffers,
  getSuggestedOffers,
} from "@/lib/services/catalog.service";
import { getPublishedReviews, type StoreReview } from "@/lib/services/reviews.service";

/**
 * Homepage section data.
 *
 * Sections are resolved concurrently and each read is isolated: one failing
 * section is dropped from the page rather than taking the homepage down with it.
 * A section that resolves to nothing is also dropped, so an admin enabling a
 * section before adding content does not leave an empty heading behind.
 */

export type ResolvedHomeSection =
  | { kind: "games"; section: HomeSection; games: StoreGame[] }
  | { kind: "offers"; section: HomeSection; offers: StoreOffer[] }
  | { kind: "reviews"; section: HomeSection; reviews: StoreReview[] }
  | { kind: "social"; section: HomeSection };

/** Featured games for the hero, resolved separately from the section list. */
export type HomeCarousel = {
  section: HomeSection | null;
  games: StoreGame[];
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
    case "games": {
      const games = await safely(section.type, () => getActiveGames(locale, section.limit), []);
      return games.length > 0 ? { kind: "games", section, games } : null;
    }
    case "game_picks": {
      const games = await safely(section.type, () => getGamesByIds(locale, section.gameIds), []);
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
    return { section: null, games: [] };
  }

  return {
    section,
    games: await safely("carousel", () => getCarouselGames(locale, section.limit), []),
  };
}
