import "server-only";

import { requireAdmin } from "@/lib/auth/guards";
import { normalizeHomeLayout, type HomeSection } from "@/lib/home/layout";
import {
  normalizePublicSettings,
  type ContactChannel,
  type PublicStoreSettings,
  type ContactChannelKind,
  type SocialLink,
  type SocialPlatform,
} from "@/lib/settings/public-settings";
import type { PageSeo, SeoPagePath } from "@/lib/settings/page-seo";
import {
  safeColour,
  type Backdrop,
  type ThemeMode,
  type ThemeSettings,
} from "@/lib/settings/theme-settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

/**
 * Admin reads and writes of the presentation half of `store_settings`.
 *
 * Every function runs behind {@link requireAdmin} and uses the caller's own
 * session, so the database's admin policy is the real gate.
 *
 * The row also holds `payments` and `providers` — the G2Bulk API key lives in
 * `providers`. Nothing here selects either column, so a secret can never reach a
 * client component through this service, and because each writer updates only
 * its own column, a save can never blank one either. Within a column, a writer
 * merges into the stored object rather than replacing it, so keys this editor
 * does not manage (a future field, a hand-added one) survive a save.
 *
 * Reads are normalized with the same functions the storefront uses, so the
 * dashboard always shows exactly what a visitor would get.
 */

const SETTINGS_ID = "global";

/** Presentation columns only: `payments` and `providers` are deliberately absent. */
const PRESENTATION_COLUMNS = "home_layout, social_links, seo, contact, theme, branding";

type PresentationRow = {
  home_layout: Json;
  social_links: Json;
  seo: Json;
  contact: Json;
  theme: Json;
  branding: Json;
};

export type WebsiteSettings = {
  sections: HomeSection[];
  socialLinks: SocialLink[];
  contactChannels: ContactChannel[];
  contactNoteAr: string;
  contactNoteEn: string;
  /*
   * The storefront's own shape rather than a copy of it: the editor must show
   * exactly what a visitor gets, and a second declaration of the same fields is
   * a second place to forget one.
   */
  seo: PublicStoreSettings["seo"];
  theme: ThemeSettings;
  branding: PublicStoreSettings["branding"];
};

export type SocialLinkInput = {
  platform: SocialPlatform;
  labelAr: string;
  labelEn: string;
  url: string;
};

export type ContactChannelInput = {
  kind: ContactChannelKind;
  labelAr: string;
  labelEn: string;
  value: string;
  /** Explicit href, used for `link` channels whose value is already a URL. */
  url?: string;
};

export type ContactSettingsInput = {
  channels: ContactChannelInput[];
  noteAr: string;
  noteEn: string;
};

export type SeoInput = {
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  ogImageUrl: string | null;
};

export type BrandingInput = {
  nameAr: string;
  nameEn: string;
  useEverywhere: boolean;
};

type JsonObject = { [key: string]: Json | undefined };

/** A stored JSON object, or an empty one when the column holds anything else. */
function toJsonObject(value: Json): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

function toJsonArray(value: Json): Json[] {
  return Array.isArray(value) ? value : [];
}

async function readPresentationRow(): Promise<PresentationRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("store_settings")
    .select(PRESENTATION_COLUMNS)
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`Reading website settings failed: ${error.message}`);
  }

  return {
    home_layout: data?.home_layout ?? [],
    social_links: data?.social_links ?? [],
    seo: data?.seo ?? {},
    contact: data?.contact ?? {},
    theme: data?.theme ?? {},
    branding: data?.branding ?? {},
  };
}

/** Write one presentation column, leaving every other column untouched. */
async function updateColumn(
  update: Partial<
    Pick<
      PresentationRow,
      "home_layout" | "social_links" | "seo" | "contact" | "theme" | "branding"
    >
  >,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("store_settings")
    .update(update)
    .eq("id", SETTINGS_ID)
    .select("id")
    .single();

  if (error) {
    throw new Error(`Saving website settings failed: ${error.message}`);
  }
}

export async function getWebsiteSettings(): Promise<WebsiteSettings> {
  await requireAdmin();

  const row = await readPresentationRow();
  const settings = normalizePublicSettings({
    social_links: toJsonArray(row.social_links),
    seo: toJsonObject(row.seo),
    contact: toJsonObject(row.contact),
    theme: toJsonObject(row.theme),
    branding: toJsonObject(row.branding),
  });

  return {
    sections: normalizeHomeLayout(row.home_layout),
    socialLinks: settings.socialLinks,
    contactChannels: settings.contactChannels,
    contactNoteAr: settings.contactNoteAr,
    contactNoteEn: settings.contactNoteEn,
    seo: settings.seo,
    theme: settings.theme,
    branding: settings.branding,
  };
}

/**
 * One thing a handpicked section can be pointed at.
 *
 * Games, packages and reviews are different rows with nothing in common, but
 * the editor treats all three the same way — a list you tick — so they are
 * flattened to one shape here rather than three near-identical pickers.
 */
export type PickCandidate = {
  id: string;
  labelAr: string;
  labelEn: string;
  /** Second line: the game a package belongs to, or a review's own words. */
  detail: string | null;
  imageUrl: string | null;
};

export type HomePickCandidates = {
  games: PickCandidate[];
  offers: PickCandidate[];
  reviews: PickCandidate[];
};

/*
 * A ceiling per list, not a page. These feed a picker that is filtered in the
 * browser, so the whole list has to arrive — but a catalogue can grow without
 * limit and this page must not grow with it. Well past what a homepage row can
 * show, and the search box narrows the rest.
 */
const PICK_CANDIDATE_LIMIT = 200;

/**
 * Everything a handpicked section could be pointed at.
 *
 * Published items only, because a section pointing at an unpublished one shows
 * a gap on the homepage and no explanation on this page. Reviews are the
 * approved ones for the same reason.
 */
export async function getHomePickCandidates(): Promise<HomePickCandidates> {
  await requireAdmin();

  const client = await createSupabaseServerClient();

  const [games, offers, reviews] = await Promise.all([
    client
      .from("games")
      .select("id, name_ar, name_en, image_url, logo_url")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name_en", { ascending: true })
      .limit(PICK_CANDIDATE_LIMIT),
    client
      .from("offers")
      .select("id, name_ar, name_en, price, currency, games!inner(name_en, is_active)")
      .eq("is_active", true)
      .eq("games.is_active", true)
      .order("sort_order", { ascending: true })
      .limit(PICK_CANDIDATE_LIMIT),
    client
      .from("reviews")
      .select("id, display_name, body, rating")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(PICK_CANDIDATE_LIMIT),
  ]);

  if (games.error || offers.error || reviews.error) {
    const reason = games.error ?? offers.error ?? reviews.error;

    throw new Error(`Reading homepage pick candidates failed: ${reason?.message}`);
  }

  return {
    games: games.data.map((game) => ({
      id: game.id,
      labelAr: game.name_ar,
      labelEn: game.name_en,
      detail: null,
      imageUrl: game.logo_url ?? game.image_url,
    })),
    offers: offers.data.map((offer) => ({
      id: offer.id,
      labelAr: offer.name_ar,
      labelEn: offer.name_en,
      // Package names repeat across games — "1000 points" says nothing on its
      // own — so the game it belongs to is the label that makes it pickable.
      detail: offer.games.name_en,
      imageUrl: null,
    })),
    reviews: reviews.data.map((review) => ({
      id: review.id,
      labelAr: review.display_name,
      labelEn: review.display_name,
      detail: review.body.slice(0, 90),
      imageUrl: null,
    })),
  };
}

/**
 * The snake_case shape {@link normalizeHomeLayout} reads back.
 *
 * The runtime shape is camelCase, so writing a section without this mapping
 * would store keys the normalizer ignores and silently reset every field to its
 * default on the next read.
 */
function toStoredSection(section: HomeSection): JsonObject {
  return {
    id: section.id,
    type: section.type,
    enabled: section.enabled,
    title_ar: section.titleAr,
    title_en: section.titleEn,
    subtitle_ar: section.subtitleAr,
    subtitle_en: section.subtitleEn,
    limit: section.limit,
    interval_seconds: section.intervalSeconds,
    autoplay: section.autoplay,
    loop: section.loop,
    align: section.align,
    game_ids: [...section.gameIds],
    offer_ids: [...section.offerIds],
    review_ids: [...section.reviewIds],
    show_submit_form: section.showSubmitForm,
  };
}

export async function saveHomeLayout(sections: readonly HomeSection[]): Promise<void> {
  await requireAdmin();

  await updateColumn({ home_layout: sections.map(toStoredSection) });
}

export async function saveSocialLinks(links: readonly SocialLinkInput[]): Promise<void> {
  await requireAdmin();

  await updateColumn({
    social_links: links.map((link) => ({
      platform: link.platform,
      label_ar: link.labelAr,
      label_en: link.labelEn,
      url: link.url,
    })),
  });
}

export async function saveContactChannels(input: ContactSettingsInput): Promise<void> {
  await requireAdmin();

  const row = await readPresentationRow();

  await updateColumn({
    contact: {
      ...toJsonObject(row.contact),
      channels: input.channels.map((channel) => ({
        kind: channel.kind,
        label_ar: channel.labelAr,
        label_en: channel.labelEn,
        value: channel.value,
        ...(channel.url ? { url: channel.url } : {}),
      })),
      note_ar: input.noteAr,
      note_en: input.noteEn,
    },
  });
}

export async function saveSeo(seo: SeoInput): Promise<void> {
  await requireAdmin();

  const row = await readPresentationRow();
  const next: JsonObject = {
    ...toJsonObject(row.seo),
    title_ar: seo.titleAr,
    title_en: seo.titleEn,
    description_ar: seo.descriptionAr,
    description_en: seo.descriptionEn,
  };

  /*
   * An empty share image is stored as a missing key, never as "": the public
   * settings schema requires a non-empty safe URL there, and one invalid value
   * would fail the whole settings parse and blank the storefront chrome.
   */
  if (seo.ogImageUrl) {
    next.og_image_url = seo.ogImageUrl;
  } else {
    delete next.og_image_url;
  }

  await updateColumn({ seo: next });
}

/**
 * Save the site name.
 *
 * An empty name is a valid save: it means "use the built-in store brand"
 * rather than a mistake. The switch only decides how far the name spreads —
 * the homepage tab always uses it.
 */
export async function saveBranding(input: BrandingInput): Promise<void> {
  await requireAdmin();

  await updateColumn({
    branding: {
      name_ar: input.nameAr.trim(),
      name_en: input.nameEn.trim(),
      use_everywhere: input.useEverywhere,
    },
  });
}

/**
 * Save the theme.
 *
 * A colour that is not a plain hex value is stored as absent rather than as
 * itself, so the storefront falls back to the token file. The same check runs
 * again on read, because this column is hand-editable and the database is not
 * required to trust what an earlier version of this code wrote.
 */
export async function saveTheme(input: {
  accent: string | null;
  accent2: string | null;
  defaultMode: ThemeMode;
  backdrop: Backdrop;
}): Promise<void> {
  await requireAdmin();

  const row = await readPresentationRow();
  const next: JsonObject = {
    ...toJsonObject(row.theme),
    default_mode: input.defaultMode,
    backdrop: input.backdrop,
  };
  const accent = safeColour(input.accent);
  const accent2 = safeColour(input.accent2);

  if (accent) {
    next.accent = accent;
  } else {
    delete next.accent;
  }

  if (accent2) {
    next.accent_2 = accent2;
  } else {
    delete next.accent_2;
  }

  await updateColumn({ theme: next });
}

/**
 * Save one page's title and description.
 *
 * Stored under the route path, beside the homepage's own SEO in the same
 * column. An entry whose fields are all empty is removed rather than stored
 * blank, so "never set" and "cleared" stay the same thing — the page falls back
 * to its own wording either way, and a row of empty strings in the settings
 * would only suggest otherwise.
 */
export async function savePageSeo(path: SeoPagePath, seo: PageSeo): Promise<void> {
  await requireAdmin();

  const row = await readPresentationRow();
  const stored = toJsonObject(row.seo);
  const pages: JsonObject = toJsonObject(stored.pages ?? {});
  const entry: JsonObject = {
    title_ar: seo.titleAr.trim(),
    title_en: seo.titleEn.trim(),
    description_ar: seo.descriptionAr.trim(),
    description_en: seo.descriptionEn.trim(),
  };

  if (Object.values(entry).some((value) => typeof value === "string" && value.length > 0)) {
    pages[path] = entry;
  } else {
    delete pages[path];
  }

  await updateColumn({ seo: { ...stored, pages } });
}

/**
 * Carousel behaviour.
 *
 * Its own writer rather than four more columns on the layout editor: the
 * carousel is one section among nine there, and rotation, looping and alignment
 * are settings for a component rather than for a list of sections. It edits the
 * carousel section in place and leaves the other eight exactly as they were.
 */
export async function saveCarouselSettings(input: {
  autoplay: boolean;
  intervalSeconds: number;
  loop: boolean;
  align: "start" | "center";
}): Promise<void> {
  await requireAdmin();

  const row = await readPresentationRow();
  const sections = normalizeHomeLayout(row.home_layout).map((section) =>
    section.type === "carousel"
      ? {
          ...section,
          autoplay: input.autoplay,
          intervalSeconds: input.intervalSeconds,
          loop: input.loop,
          align: input.align,
        }
      : section,
  );

  await updateColumn({ home_layout: sections.map(toStoredSection) });
}
