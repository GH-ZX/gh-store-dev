"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { formFlag, formText } from "@/lib/forms/form-data";
import { HOME_SECTION_LIMIT_MAX, HOME_SECTION_LIMIT_MIN } from "@/lib/home/layout";
import { logFailure } from "@/lib/logging/logger";
import {
  GameNotFoundError,
  getAdminGame,
  updateAdminGame,
} from "@/lib/services/admin-catalog.service";
import { getWebsiteSettings, saveHomeLayout } from "@/lib/services/admin-website.service";
import type { LiveEditState } from "@/lib/live-edit/action-state";

/**
 * Editing the storefront from the storefront.
 *
 * The dashboard already has forms for all of this. What it does not have is the
 * page in front of you: an owner who can see that a heading is wrong, or that a
 * game is showing the wrong artwork, should not have to work out which of
 * eleven dashboard cards owns it and then check the result by navigating back.
 *
 * Every action re-checks {@link requireAdmin}. The buttons are rendered only for
 * an administrator, but a rendered button is a hint, not a permission — these
 * are the same actions a stranger could post to.
 *
 * Each one edits a single row of a single record and carries the rest across
 * unchanged, so two panels open at once cannot overwrite each other's fields.
 */

const localizedText = z.string().trim().max(160).optional();

function failure(error: string): LiveEditState {
  return { error, notice: null };
}

function saved(): LiveEditState {
  return { error: null, notice: "saved" };
}

const sectionCopySchema = z.object({
  section_id: z.string().trim().min(1).max(64),
  title_ar: localizedText,
  title_en: localizedText,
  subtitle_ar: localizedText,
  subtitle_en: localizedText,
  enabled: z.boolean(),
  limit: z.coerce.number().int().min(HOME_SECTION_LIMIT_MIN).max(HOME_SECTION_LIMIT_MAX).optional(),
});

/** One homepage section's wording, visibility, and item count. */
export async function saveHomeSectionCopyAction(
  _state: LiveEditState,
  formData: FormData,
): Promise<LiveEditState> {
  await requireAdmin();

  const parsed = sectionCopySchema.safeParse({
    section_id: formText(formData, "section_id"),
    title_ar: formText(formData, "title_ar"),
    title_en: formText(formData, "title_en"),
    subtitle_ar: formText(formData, "subtitle_ar"),
    subtitle_en: formText(formData, "subtitle_en"),
    enabled: formFlag(formData, "enabled"),
    limit: formText(formData, "limit"),
  });

  if (!parsed.success) {
    return failure("invalid_input");
  }

  const input = parsed.data;

  try {
    const { sections } = await getWebsiteSettings();

    if (!sections.some((section) => section.id === input.section_id)) {
      /*
       * The layout changed under the open panel — the section was removed from
       * the dashboard in another tab. Saying so beats writing it back, which
       * would resurrect a section somebody deleted on purpose.
       */
      return failure("not_found");
    }

    const next = sections.map((section) => {
      if (section.id !== input.section_id) {
        return section;
      }

      return {
        ...section,
        // A blank title falls back to the built-in one, matching the dashboard;
        // a blank subtitle means no subtitle, which is how it is removed.
        titleAr: input.title_ar ?? section.titleAr,
        titleEn: input.title_en ?? section.titleEn,
        subtitleAr: input.subtitle_ar ?? "",
        subtitleEn: input.subtitle_en ?? "",
        enabled: input.enabled,
        limit: input.limit ?? section.limit,
      };
    });

    await saveHomeLayout(next);
  } catch (error) {
    logFailure("admin.live-edit", "home_section_save_failed", error, {
      section: input.section_id,
    });

    return failure("unknown");
  }

  revalidatePath("/", "layout");

  return saved();
}

/**
 * The half of a game this panel edits, in both languages.
 *
 * Fetched when the panel opens rather than rendered into the page with every
 * card. A storefront card carries one language and no flags — it is what a
 * visitor needs — and widening it so an editor that opens once could avoid a
 * round trip would put an admin's data in every visitor's payload.
 */
export type GamePresentation = {
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  imageUrl: string;
  logoUrl: string;
  carouselBadgeAr: string;
  carouselBadgeEn: string;
  isFeatured: boolean;
  showInCarousel: boolean;
};

export type LoadGamePresentationResult =
  | { ok: true; game: GamePresentation }
  | { ok: false; error: "not_found" | "unknown" };

export async function loadGamePresentationAction(
  gameId: string,
): Promise<LoadGamePresentationResult> {
  await requireAdmin();

  try {
    const detail = await getAdminGame(gameId);

    if (!detail) {
      return { ok: false, error: "not_found" };
    }

    const { game } = detail;

    // Nulls become empty strings here rather than in the form: an input whose
    // value is undefined is uncontrolled, and React says so at length.
    return {
      ok: true,
      game: {
        nameAr: game.nameAr,
        nameEn: game.nameEn,
        descriptionAr: game.descriptionAr ?? "",
        descriptionEn: game.descriptionEn ?? "",
        imageUrl: game.imageUrl ?? "",
        logoUrl: game.logoUrl ?? "",
        carouselBadgeAr: game.carouselBadgeAr ?? "",
        carouselBadgeEn: game.carouselBadgeEn ?? "",
        isFeatured: game.isFeatured,
        showInCarousel: game.showInCarousel,
      },
    };
  } catch (error) {
    if (error instanceof GameNotFoundError) {
      return { ok: false, error: "not_found" };
    }

    logFailure("admin.live-edit", "game_presentation_read_failed", error, { game: gameId });

    return { ok: false, error: "unknown" };
  }
}

const gamePresentationSchema = z.object({
  game_id: z.string().trim().min(1),
  name_ar: z.string().trim().min(1).max(160),
  name_en: z.string().trim().min(1).max(160),
  description_ar: z.string().trim().max(600).optional(),
  description_en: z.string().trim().max(600).optional(),
  image_url: z.string().trim().max(600).optional(),
  logo_url: z.string().trim().max(600).optional(),
  carousel_badge_ar: localizedText,
  carousel_badge_en: localizedText,
  is_featured: z.boolean(),
  show_in_carousel: z.boolean(),
});

/**
 * How one game presents itself: its name, its artwork, and where it appears.
 *
 * Deliberately not its slug, its packages, or its prices. Those change what a
 * customer pays or where a link points, and neither belongs behind a pencil on
 * a page an owner is browsing — the catalog page owns them, with its own
 * warnings.
 */
export async function saveGamePresentationAction(
  _state: LiveEditState,
  formData: FormData,
): Promise<LiveEditState> {
  await requireAdmin();

  const parsed = gamePresentationSchema.safeParse({
    game_id: formText(formData, "game_id"),
    name_ar: formText(formData, "name_ar"),
    name_en: formText(formData, "name_en"),
    description_ar: formText(formData, "description_ar"),
    description_en: formText(formData, "description_en"),
    image_url: formText(formData, "image_url"),
    logo_url: formText(formData, "logo_url"),
    carousel_badge_ar: formText(formData, "carousel_badge_ar"),
    carousel_badge_en: formText(formData, "carousel_badge_en"),
    is_featured: formFlag(formData, "is_featured"),
    show_in_carousel: formFlag(formData, "show_in_carousel"),
  });

  if (!parsed.success) {
    return failure("invalid_input");
  }

  const input = parsed.data;

  try {
    const detail = await getAdminGame(input.game_id);

    if (!detail) {
      return failure("not_found");
    }

    // Read, merge, write: the fields this panel does not show — slug, sort
    // order, publication, the points name — are carried across from the row as
    // it stands rather than being re-sent by the browser and trusted.
    await updateAdminGame(input.game_id, {
      ...detail.game,
      nameAr: input.name_ar,
      nameEn: input.name_en,
      descriptionAr: input.description_ar ?? null,
      descriptionEn: input.description_en ?? null,
      imageUrl: input.image_url ?? null,
      logoUrl: input.logo_url ?? null,
      carouselBadgeAr: input.carousel_badge_ar ?? null,
      carouselBadgeEn: input.carousel_badge_en ?? null,
      isFeatured: input.is_featured,
      showInCarousel: input.show_in_carousel,
    });
  } catch (error) {
    if (error instanceof GameNotFoundError) {
      return failure("not_found");
    }

    logFailure("admin.live-edit", "game_presentation_save_failed", error, { game: input.game_id });

    return failure("unknown");
  }

  revalidatePath("/", "layout");

  return saved();
}
