import "server-only";

import { requireAdmin } from "@/lib/auth/guards";
import { normalizeHomeLayout, type HomeSection } from "@/lib/home/layout";
import {
  normalizePublicSettings,
  type ContactChannel,
  type ContactChannelKind,
  type SocialLink,
  type SocialPlatform,
} from "@/lib/settings/public-settings";
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
const PRESENTATION_COLUMNS = "home_layout, social_links, seo, contact";

type PresentationRow = {
  home_layout: Json;
  social_links: Json;
  seo: Json;
  contact: Json;
};

export type WebsiteSettings = {
  sections: HomeSection[];
  socialLinks: SocialLink[];
  contactChannels: ContactChannel[];
  contactNoteAr: string;
  contactNoteEn: string;
  seo: {
    titleAr: string;
    titleEn: string;
    descriptionAr: string;
    descriptionEn: string;
    ogImageUrl: string | null;
  };
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
  };
}

/** Write one presentation column, leaving every other column untouched. */
async function updateColumn(
  update: Partial<Pick<PresentationRow, "home_layout" | "social_links" | "seo" | "contact">>,
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
  });

  return {
    sections: normalizeHomeLayout(row.home_layout),
    socialLinks: settings.socialLinks,
    contactChannels: settings.contactChannels,
    contactNoteAr: settings.contactNoteAr,
    contactNoteEn: settings.contactNoteEn,
    seo: settings.seo,
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
