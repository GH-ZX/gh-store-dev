import type { Locale } from "@/i18n/config";
import type { StoreGame } from "@/lib/catalog/game-mapper";
import type { StoreOffer } from "@/lib/catalog/offer-mapper";
import type { HomeSection } from "@/lib/home/layout";
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

async function safely<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch {
    return fallback;
  }
}

async function resolveSection(
  locale: Locale,
  section: HomeSection,
): Promise<ResolvedHomeSection | null> {
  switch (section.type) {
    case "games": {
      const games = await safely(() => getActiveGames(locale, section.limit), []);
      return games.length > 0 ? { kind: "games", section, games } : null;
    }
    case "game_picks": {
      const games = await safely(() => getGamesByIds(locale, section.gameIds), []);
      return games.length > 0 ? { kind: "games", section, games } : null;
    }
    case "gift_cards": {
      const offers = await safely(() => getOffersByType(locale, "gift_card", section.limit), []);
      return offers.length > 0 ? { kind: "offers", section, offers } : null;
    }
    case "sale_offers": {
      const offers = await safely(() => getSaleOffers(locale, section.limit), []);
      return offers.length > 0 ? { kind: "offers", section, offers } : null;
    }
    case "suggested_offers": {
      const offers = await safely(() => getSuggestedOffers(locale, section.limit), []);
      return offers.length > 0 ? { kind: "offers", section, offers } : null;
    }
    case "offer_picks": {
      const offers = await safely(() => getOffersByIds(locale, section.offerIds), []);
      return offers.length > 0 ? { kind: "offers", section, offers } : null;
    }
    case "customer_reviews": {
      const reviews = await safely(
        () => getPublishedReviews(locale, section.limit, section.reviewIds),
        [],
      );
      return reviews.length > 0 ? { kind: "reviews", section, reviews } : null;
    }
    case "social_links":
      return { kind: "social", section };
    case "carousel":
      // Resolved by getHomeCarousel so the hero can render above the section list.
      return null;
  }
}

export async function resolveHomeSections(
  locale: Locale,
  layout: HomeSection[],
): Promise<ResolvedHomeSection[]> {
  const enabled = layout.filter((section) => section.enabled && section.type !== "carousel");
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
    games: await safely(() => getCarouselGames(locale, section.limit), []),
  };
}
