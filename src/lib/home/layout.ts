import { z } from "zod";
import type { Locale } from "@/i18n/config";

/**
 * Homepage layout contract.
 *
 * The layout is authored by an admin and stored as JSON in
 * `store_settings.home_layout`. Because that value can be edited by hand, every
 * read is normalized through {@link normalizeHomeLayout}: unknown section types
 * are dropped, duplicate ids are dropped, and out-of-range numbers are clamped.
 * A layout that normalizes to nothing renderable falls back to
 * {@link DEFAULT_HOME_LAYOUT} so the homepage is never blank.
 */

export const HOME_SECTION_TYPES = [
  "carousel",
  "games",
  "gift_cards",
  "sale_offers",
  "suggested_offers",
  "game_picks",
  "offer_picks",
  "customer_reviews",
  "social_links",
] as const;

export type HomeSectionType = (typeof HOME_SECTION_TYPES)[number];

/** Section types that may only appear once in a layout. */
const SINGLETON_SECTION_TYPES = new Set<HomeSectionType>([
  "carousel",
  "games",
  "gift_cards",
  "social_links",
]);

/**
 * Whether a second section of this type would be dropped on the way in.
 *
 * The editor asks so it can grey out a type instead of offering it, adding it,
 * and having the normaliser quietly discard it on the next read.
 */
export function isSingletonSectionType(type: HomeSectionType): boolean {
  return SINGLETON_SECTION_TYPES.has(type);
}

export const HOME_SECTION_LIMIT_MIN = 1;
export const HOME_SECTION_LIMIT_MAX = 12;
export const HOME_CAROUSEL_INTERVAL_MIN_SECONDS = 3;
export const HOME_CAROUSEL_INTERVAL_MAX_SECONDS = 30;

/*
 * Only `type` is strict. Every other field falls back rather than failing, so a
 * hand-edited title that is too long, or one malformed id in a list, degrades
 * that single field instead of removing a whole section from the homepage.
 */
const localizedText = z.string().trim().max(160).optional().catch(undefined);
const looseList = z.array(z.unknown()).optional().catch(undefined);
const looseInteger = z.coerce.number().int().optional().catch(undefined);

const homeSectionInputSchema = z.object({
  id: z.string().trim().min(1).max(64).optional().catch(undefined),
  type: z.enum(HOME_SECTION_TYPES),
  enabled: z.boolean().optional().catch(undefined),
  title_ar: localizedText,
  title_en: localizedText,
  subtitle_ar: localizedText,
  subtitle_en: localizedText,
  limit: looseInteger,
  interval_seconds: looseInteger,
  autoplay: z.boolean().optional().catch(undefined),
  loop: z.boolean().optional().catch(undefined),
  align: z.enum(["start", "center"]).optional().catch(undefined),
  game_ids: looseList,
  offer_ids: looseList,
  review_ids: looseList,
  show_submit_form: z.boolean().optional().catch(undefined),
});

const homeLayoutInputSchema = z.array(z.unknown());

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Keep the well-formed ids from a hand-edited list and drop the rest. */
function toIdList(value: unknown[] | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id))
    .slice(0, HOME_SECTION_LIMIT_MAX);
}

export type HomeSection = {
  id: string;
  type: HomeSectionType;
  enabled: boolean;
  titleAr: string;
  titleEn: string;
  subtitleAr: string;
  subtitleEn: string;
  limit: number;
  intervalSeconds: number;
  /** Carousel only. Rotation is off under reduced motion whatever this says. */
  autoplay: boolean;
  loop: boolean;
  /** Where a slide settles: `center` reads as a showcase, `start` as a shelf. */
  align: "start" | "center";
  gameIds: string[];
  offerIds: string[];
  reviewIds: string[];
  showSubmitForm: boolean;
};

type SectionDefaults = {
  titleAr: string;
  titleEn: string;
  subtitleAr?: string;
  subtitleEn?: string;
  limit: number;
};

const SECTION_DEFAULTS: Record<HomeSectionType, SectionDefaults> = {
  carousel: { titleAr: "الأبرز الآن", titleEn: "Featured now", limit: 8 },
  games: { titleAr: "شحن الألعاب", titleEn: "Game top-ups", limit: 12 },
  gift_cards: { titleAr: "بطاقات وأكواد", titleEn: "Gift cards & codes", limit: 8 },
  sale_offers: { titleAr: "عروض وخصومات", titleEn: "On sale", limit: 8 },
  suggested_offers: { titleAr: "الأكثر طلبًا", titleEn: "Bestsellers", limit: 10 },
  game_picks: { titleAr: "ألعاب مختارة", titleEn: "Handpicked games", limit: 8 },
  offer_picks: { titleAr: "باقات مختارة", titleEn: "Handpicked offers", limit: 8 },
  customer_reviews: { titleAr: "آراء الزبائن", titleEn: "What customers say", limit: 8 },
  social_links: {
    titleAr: "تابعنا",
    titleEn: "Follow us",
    subtitleAr: "كل قنواتنا ووسائل التواصل في مكان واحد.",
    subtitleEn: "Every channel and social account in one place.",
    limit: 8,
  },
};

/** The layout rendered when an admin has not configured one yet. */
export const DEFAULT_HOME_LAYOUT: readonly HomeSection[] = Object.freeze([
  createHomeSection("carousel", "carousel"),
  createHomeSection("games", "games"),
  createHomeSection("gift_cards", "gift_cards"),
  createHomeSection("sale_offers", "sale_offers"),
  createHomeSection("suggested_offers", "suggested_offers"),
  createHomeSection("customer_reviews", "customer_reviews"),
  createHomeSection("social_links", "social_links"),
]);

export function createHomeSection(type: HomeSectionType, id: string): HomeSection {
  const defaults = SECTION_DEFAULTS[type];

  return {
    id,
    type,
    enabled: true,
    titleAr: defaults.titleAr,
    titleEn: defaults.titleEn,
    subtitleAr: defaults.subtitleAr ?? "",
    subtitleEn: defaults.subtitleEn ?? "",
    limit: defaults.limit,
    intervalSeconds: 6,
    autoplay: true,
    loop: true,
    align: "center",
    gameIds: [],
    offerIds: [],
    reviewIds: [],
    showSubmitForm: true,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Deep copy of the defaults, so callers can never mutate the shared constant. */
function cloneDefaultLayout(): HomeSection[] {
  return DEFAULT_HOME_LAYOUT.map((section) => ({
    ...section,
    gameIds: [...section.gameIds],
    offerIds: [...section.offerIds],
    reviewIds: [...section.reviewIds],
  }));
}

/**
 * Turn an untrusted stored layout into a renderable one.
 *
 * Returns {@link DEFAULT_HOME_LAYOUT} when the input is not an array, contains
 * no recognizable sections, or leaves every section disabled.
 */
export function normalizeHomeLayout(value: unknown): HomeSection[] {
  const parsedArray = homeLayoutInputSchema.safeParse(value);

  if (!parsedArray.success) {
    return cloneDefaultLayout();
  }

  const usedIds = new Set<string>();
  const usedSingletons = new Set<HomeSectionType>();
  const sections: HomeSection[] = [];

  parsedArray.data.forEach((raw, index) => {
    const parsed = homeSectionInputSchema.safeParse(raw);

    if (!parsed.success) {
      return;
    }

    const input = parsed.data;

    if (SINGLETON_SECTION_TYPES.has(input.type)) {
      if (usedSingletons.has(input.type)) {
        return;
      }
      usedSingletons.add(input.type);
    }

    const id = input.id ?? `${input.type}_${index}`;

    if (usedIds.has(id)) {
      return;
    }
    usedIds.add(id);

    const defaults = createHomeSection(input.type, id);

    sections.push({
      ...defaults,
      enabled: input.enabled !== false,
      titleAr: input.title_ar || defaults.titleAr,
      titleEn: input.title_en || defaults.titleEn,
      subtitleAr: input.subtitle_ar ?? defaults.subtitleAr,
      subtitleEn: input.subtitle_en ?? defaults.subtitleEn,
      limit:
        input.limit === undefined
          ? defaults.limit
          : clamp(input.limit, HOME_SECTION_LIMIT_MIN, HOME_SECTION_LIMIT_MAX),
      intervalSeconds:
        input.interval_seconds === undefined
          ? defaults.intervalSeconds
          : clamp(
              input.interval_seconds,
              HOME_CAROUSEL_INTERVAL_MIN_SECONDS,
              HOME_CAROUSEL_INTERVAL_MAX_SECONDS,
            ),
      // Defaults chosen to match what the carousel did before it was settable,
      // so an existing layout renders identically until somebody changes it.
      autoplay: input.autoplay !== false,
      loop: input.loop !== false,
      align: input.align ?? "center",
      gameIds: toIdList(input.game_ids),
      offerIds: toIdList(input.offer_ids),
      reviewIds: toIdList(input.review_ids),
      showSubmitForm: input.show_submit_form !== false,
    });
  });

  const renderable = sections.filter((section) => section.enabled);

  if (renderable.length === 0) {
    return cloneDefaultLayout();
  }

  return sections;
}

export function getHomeSectionTitle(section: HomeSection, locale: Locale): string {
  return locale === "ar" ? section.titleAr : section.titleEn;
}

export function getHomeSectionSubtitle(section: HomeSection, locale: Locale): string {
  return locale === "ar" ? section.subtitleAr : section.subtitleEn;
}

/** Storefront path a section's "view all" link points at, or null when it has no page. */
export function getHomeSectionPagePath(section: HomeSection): string | null {
  switch (section.type) {
    case "games":
    case "game_picks":
      return "/games";
    case "gift_cards":
      return "/gift-cards";
    case "sale_offers":
    case "offer_picks":
    case "suggested_offers":
      return "/sale";
    case "social_links":
      return "/links";
    default:
      return null;
  }
}
