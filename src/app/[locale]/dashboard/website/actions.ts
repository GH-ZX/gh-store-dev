"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { formFlag, formText } from "@/lib/forms/form-data";
import { logFailure } from "@/lib/logging/logger";
import {
  createHomeSection,
  DEFAULT_HOME_LAYOUT,
  HOME_SECTION_LIMIT_MAX,
  HOME_SECTION_LIMIT_MIN,
  HOME_SECTION_TYPES,
} from "@/lib/home/layout";
import {
  getWebsiteSettings,
  saveContactChannels,
  saveHomeLayout,
  saveSeo,
  saveSocialLinks,
  saveTheme,
  type ContactChannelInput,
  type SocialLinkInput,
} from "@/lib/services/admin-website.service";
import { safeColour, THEME_MODES, type ThemeMode } from "@/lib/settings/theme-settings";
import {
  CONTACT_FIELD_PREFIX,
  CONTACT_KIND_OPTIONS,
  MAX_EDITOR_ROWS,
  rowField,
  SECTION_FIELD_PREFIX,
  SOCIAL_FIELD_PREFIX,
  SOCIAL_PLATFORM_OPTIONS,
  type WebsiteActionState,
} from "@/app/[locale]/dashboard/website/action-state";

/**
 * Website settings actions.
 *
 * Every result is a message key (`invalid_input`, `invalid_url`, `unknown`) so
 * the editor renders it in the admin's language. Rows arrive as indexed fields
 * (`links.0.url`) and are read through the FormData helpers, because
 * `FormData.get` yields `null` for an absent field and a Zod `.optional()`
 * rejects null.
 *
 * These four settings drive the storefront header, footer, and homepage, so a
 * successful save revalidates the whole layout tree, not just this page.
 */

/** Mirrors the storefront's safe-URL rule; anything else is dropped when rendered. */
const SAFE_URL_SCHEMES = ["http:", "https:", "mailto:", "tel:"];

function isSafeUrl(value: string): boolean {
  try {
    return SAFE_URL_SCHEMES.includes(new URL(value).protocol);
  } catch {
    // Silent on purpose: the throw is how `URL` says "not a URL", which is the
    // answer this function was asked for and not a failure to record.
    return false;
  }
}

/** A contact value may be plain text; only a value that parses as a URL is checked. */
function looksLikeUrl(value: string): boolean {
  try {
    new URL(value);

    return true;
  } catch {
    // As above: not parsing is the answer, not an error.
    return false;
  }
}

function failure(error: string): WebsiteActionState {
  return { error, notice: null };
}

function saved(): WebsiteActionState {
  return { error: null, notice: "saved" };
}

const localizedTitle = z.string().trim().max(160).optional();
const rowLabel = z.string().trim().max(80).optional();

const sectionRowSchema = z.object({
  id: z.string().trim().min(1).max(64),
  type: z.enum(HOME_SECTION_TYPES),
  enabled: z.boolean(),
  title_ar: localizedTitle,
  title_en: localizedTitle,
  limit: z.coerce.number().int().optional(),
});

const sectionsSchema = z.array(sectionRowSchema).min(1).max(MAX_EDITOR_ROWS);

function readSectionRows(formData: FormData): unknown[] {
  const rows: unknown[] = [];

  for (let index = 0; index < MAX_EDITOR_ROWS; index += 1) {
    const type = formText(formData, rowField(SECTION_FIELD_PREFIX, index, "type"));

    if (!type) {
      continue;
    }

    rows.push({
      id: formText(formData, rowField(SECTION_FIELD_PREFIX, index, "id")),
      type,
      enabled: formFlag(formData, rowField(SECTION_FIELD_PREFIX, index, "enabled")),
      title_ar: formText(formData, rowField(SECTION_FIELD_PREFIX, index, "title_ar")),
      title_en: formText(formData, rowField(SECTION_FIELD_PREFIX, index, "title_en")),
      limit: formText(formData, rowField(SECTION_FIELD_PREFIX, index, "limit")),
    });
  }

  return rows;
}

function clampLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  return Math.min(HOME_SECTION_LIMIT_MAX, Math.max(HOME_SECTION_LIMIT_MIN, value));
}

export async function saveHomeLayoutAction(
  _state: WebsiteActionState,
  formData: FormData,
): Promise<WebsiteActionState> {
  await requireAdmin();

  const parsed = sectionsSchema.safeParse(readSectionRows(formData));

  if (!parsed.success) {
    return failure("invalid_input");
  }

  try {
    /*
     * The editor manages order, enabled, titles, and the item count. Every other
     * field — subtitles, the carousel interval, the pick lists — is carried over
     * from the saved section with the same id, so saving the layout never drops
     * content that has no control on this page.
     */
    const current = await getWebsiteSettings();
    const savedById = new Map(current.sections.map((section) => [section.id, section]));

    const sections = parsed.data.map((row) => {
      const defaults = createHomeSection(row.type, row.id);
      const previous = savedById.get(row.id);
      const base = previous && previous.type === row.type ? previous : defaults;

      return {
        ...base,
        id: row.id,
        type: row.type,
        enabled: row.enabled,
        titleAr: row.title_ar || defaults.titleAr,
        titleEn: row.title_en || defaults.titleEn,
        limit: clampLimit(row.limit, base.limit),
      };
    });

    await saveHomeLayout(sections);
  } catch (error) {
    logFailure("admin.website", "home_layout_save_failed", error);

    return failure("unknown");
  }

  revalidatePath("/", "layout");

  return saved();
}

export async function resetHomeLayoutAction(
  _state: WebsiteActionState,
  _formData: FormData,
): Promise<WebsiteActionState> {
  await requireAdmin();

  try {
    await saveHomeLayout(DEFAULT_HOME_LAYOUT);
  } catch (error) {
    logFailure("admin.website", "home_layout_reset_failed", error);

    return failure("unknown");
  }

  revalidatePath("/", "layout");

  return saved();
}

const socialRowSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORM_OPTIONS),
  label_ar: rowLabel,
  label_en: rowLabel,
  url: z.string().trim().min(1).max(500),
});

const socialLinksSchema = z.array(socialRowSchema).max(MAX_EDITOR_ROWS);

function readSocialRows(formData: FormData): unknown[] {
  const rows: unknown[] = [];

  for (let index = 0; index < MAX_EDITOR_ROWS; index += 1) {
    const platform = formText(formData, rowField(SOCIAL_FIELD_PREFIX, index, "platform"));

    if (!platform) {
      continue;
    }

    const labelAr = formText(formData, rowField(SOCIAL_FIELD_PREFIX, index, "label_ar"));
    const labelEn = formText(formData, rowField(SOCIAL_FIELD_PREFIX, index, "label_en"));
    const url = formText(formData, rowField(SOCIAL_FIELD_PREFIX, index, "url"));

    // A row added and then left untouched is dropped rather than rejected.
    if (!labelAr && !labelEn && !url) {
      continue;
    }

    rows.push({ platform, label_ar: labelAr, label_en: labelEn, url });
  }

  return rows;
}

export async function saveSocialLinksAction(
  _state: WebsiteActionState,
  formData: FormData,
): Promise<WebsiteActionState> {
  await requireAdmin();

  const parsed = socialLinksSchema.safeParse(readSocialRows(formData));

  if (!parsed.success) {
    return failure("invalid_input");
  }

  if (parsed.data.some((row) => !isSafeUrl(row.url))) {
    return failure("invalid_url");
  }

  // The same label fallback the storefront applies, resolved once at write time.
  const links: SocialLinkInput[] = parsed.data.map((row) => {
    const fallback = row.label_en || row.label_ar || row.platform;

    return {
      platform: row.platform,
      labelAr: row.label_ar || fallback,
      labelEn: row.label_en || fallback,
      url: row.url,
    };
  });

  try {
    await saveSocialLinks(links);
  } catch (error) {
    logFailure("admin.website", "social_links_save_failed", error);

    return failure("unknown");
  }

  revalidatePath("/", "layout");

  return saved();
}

const contactRowSchema = z.object({
  kind: z.enum(CONTACT_KIND_OPTIONS),
  label_ar: rowLabel,
  label_en: rowLabel,
  value: z.string().trim().min(1).max(200),
});

const contactSchema = z.object({
  channels: z.array(contactRowSchema).max(MAX_EDITOR_ROWS),
  note_ar: z.string().trim().max(400).optional(),
  note_en: z.string().trim().max(400).optional(),
});

function readContactRows(formData: FormData): unknown[] {
  const rows: unknown[] = [];

  for (let index = 0; index < MAX_EDITOR_ROWS; index += 1) {
    const kind = formText(formData, rowField(CONTACT_FIELD_PREFIX, index, "kind"));

    if (!kind) {
      continue;
    }

    const labelAr = formText(formData, rowField(CONTACT_FIELD_PREFIX, index, "label_ar"));
    const labelEn = formText(formData, rowField(CONTACT_FIELD_PREFIX, index, "label_en"));
    const value = formText(formData, rowField(CONTACT_FIELD_PREFIX, index, "value"));

    if (!labelAr && !labelEn && !value) {
      continue;
    }

    rows.push({ kind, label_ar: labelAr, label_en: labelEn, value });
  }

  return rows;
}

export async function saveContactChannelsAction(
  _state: WebsiteActionState,
  formData: FormData,
): Promise<WebsiteActionState> {
  await requireAdmin();

  const parsed = contactSchema.safeParse({
    channels: readContactRows(formData),
    note_ar: formText(formData, "note_ar"),
    note_en: formText(formData, "note_en"),
  });

  if (!parsed.success) {
    return failure("invalid_input");
  }

  if (parsed.data.channels.some((row) => looksLikeUrl(row.value) && !isSafeUrl(row.value))) {
    return failure("invalid_url");
  }

  const channels: ContactChannelInput[] = parsed.data.channels.map((row) => {
    const fallback = row.label_en || row.label_ar || row.kind;

    return {
      kind: row.kind,
      labelAr: row.label_ar || fallback,
      labelEn: row.label_en || fallback,
      value: row.value,
      /*
       * A `link` channel has no derivable href, so a value that is already a
       * safe URL is stored as the explicit one. Every other kind builds its href
       * from the value (mailto:, tel:, wa.me, t.me).
       */
      url: row.kind === "link" && isSafeUrl(row.value) ? row.value : undefined,
    };
  });

  try {
    await saveContactChannels({
      channels,
      noteAr: parsed.data.note_ar ?? "",
      noteEn: parsed.data.note_en ?? "",
    });
  } catch (error) {
    logFailure("admin.website", "contact_channels_save_failed", error);

    return failure("unknown");
  }

  revalidatePath("/", "layout");

  return saved();
}

const seoSchema = z.object({
  title_ar: localizedTitle,
  title_en: localizedTitle,
  description_ar: z.string().trim().max(320).optional(),
  description_en: z.string().trim().max(320).optional(),
  og_image_url: z.string().trim().max(500).optional(),
});

export async function saveSeoAction(
  _state: WebsiteActionState,
  formData: FormData,
): Promise<WebsiteActionState> {
  await requireAdmin();

  const parsed = seoSchema.safeParse({
    title_ar: formText(formData, "title_ar"),
    title_en: formText(formData, "title_en"),
    description_ar: formText(formData, "description_ar"),
    description_en: formText(formData, "description_en"),
    og_image_url: formText(formData, "og_image_url"),
  });

  if (!parsed.success) {
    return failure("invalid_input");
  }

  const ogImageUrl = parsed.data.og_image_url;

  if (ogImageUrl && !isSafeUrl(ogImageUrl)) {
    return failure("invalid_url");
  }

  try {
    await saveSeo({
      titleAr: parsed.data.title_ar ?? "",
      titleEn: parsed.data.title_en ?? "",
      descriptionAr: parsed.data.description_ar ?? "",
      descriptionEn: parsed.data.description_en ?? "",
      ogImageUrl: ogImageUrl ?? null,
    });
  } catch (error) {
    logFailure("admin.website", "seo_save_failed", error);

    return failure("unknown");
  }

  revalidatePath("/", "layout");

  return saved();
}

/**
 * Theme.
 *
 * An empty colour field means "use the built-in accent", which is why a blank is
 * a valid save rather than an error — clearing the field is how an owner backs
 * out of a colour they no longer want. A value that is not a plain hex colour is
 * refused outright instead of quietly ignored: silently dropping what someone
 * typed leaves them looking at a saved form that does not do what it says.
 */
const themeSchema = z.object({
  accent: z.string().trim().max(9).optional(),
  accent_2: z.string().trim().max(9).optional(),
  default_mode: z.string().optional(),
});

function resolveMode(value: string | undefined): ThemeMode {
  return value && (THEME_MODES as readonly string[]).includes(value) ? (value as ThemeMode) : "system";
}

export async function saveThemeAction(
  _state: WebsiteActionState,
  formData: FormData,
): Promise<WebsiteActionState> {
  await requireAdmin();

  const parsed = themeSchema.safeParse({
    accent: formText(formData, "accent"),
    accent_2: formText(formData, "accent_2"),
    default_mode: formText(formData, "default_mode"),
  });

  if (!parsed.success) {
    return failure("invalid_input");
  }

  const accent = parsed.data.accent ?? "";
  const accent2 = parsed.data.accent_2 ?? "";

  if ((accent && !safeColour(accent)) || (accent2 && !safeColour(accent2))) {
    return failure("invalid_colour");
  }

  try {
    await saveTheme({
      accent: accent ? accent : null,
      accent2: accent2 ? accent2 : null,
      defaultMode: resolveMode(parsed.data.default_mode),
    });
  } catch (error) {
    logFailure("admin.website", "theme_save_failed", error);

    return failure("unknown");
  }

  // Every page carries these variables, so the whole tree is stale.
  revalidatePath("/", "layout");

  return saved();
}
