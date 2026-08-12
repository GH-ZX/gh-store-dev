import { z } from "zod";
import type { Locale } from "@/i18n/config";

/**
 * Presentation settings an admin controls, as returned by
 * `get_public_store_settings()`.
 *
 * The stored JSON is hand-editable, so every field is optional in the input
 * schema and normalized to a safe default here. A malformed settings row must
 * degrade the storefront chrome, never break the page.
 */

const SOCIAL_PLATFORMS = [
  "website",
  "whatsapp",
  "telegram",
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "x",
  "discord",
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

const CONTACT_CHANNEL_KINDS = ["email", "phone", "whatsapp", "telegram", "link"] as const;

export type ContactChannelKind = (typeof CONTACT_CHANNEL_KINDS)[number];

/** Only these schemes may be rendered as a link target. */
const SAFE_URL_SCHEMES = ["http:", "https:", "mailto:", "tel:"];

function isSafeUrl(value: string): boolean {
  try {
    return SAFE_URL_SCHEMES.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

const safeUrl = z.string().trim().min(1).max(500).refine(isSafeUrl, {
  message: "Unsupported URL scheme",
});

const socialLinkSchema = z.object({
  id: z.string().trim().max(64).optional(),
  platform: z.enum(SOCIAL_PLATFORMS).optional(),
  label_ar: z.string().trim().max(80).optional(),
  label_en: z.string().trim().max(80).optional(),
  url: safeUrl,
});

const contactChannelSchema = z.object({
  id: z.string().trim().max(64).optional(),
  kind: z.enum(CONTACT_CHANNEL_KINDS).optional(),
  label_ar: z.string().trim().max(80).optional(),
  label_en: z.string().trim().max(80).optional(),
  value: z.string().trim().max(200).optional(),
  url: safeUrl.optional(),
});

const publicSettingsSchema = z.object({
  social_links: z.array(z.unknown()).optional(),
  seo: z
    .object({
      title_ar: z.string().trim().max(160).optional(),
      title_en: z.string().trim().max(160).optional(),
      description_ar: z.string().trim().max(320).optional(),
      description_en: z.string().trim().max(320).optional(),
      og_image_url: safeUrl.optional(),
    })
    .optional(),
  contact: z
    .object({
      channels: z.array(z.unknown()).optional(),
      note_ar: z.string().trim().max(400).optional(),
      note_en: z.string().trim().max(400).optional(),
    })
    .optional(),
  maintenance_mode: z.boolean().optional(),
  maintenance_message_ar: z.string().trim().max(400).nullish(),
  maintenance_message_en: z.string().trim().max(400).nullish(),
  home_layout: z.unknown().optional(),
});

export type SocialLink = {
  id: string;
  platform: SocialPlatform;
  labelAr: string;
  labelEn: string;
  url: string;
};

export type ContactChannel = {
  id: string;
  kind: ContactChannelKind;
  labelAr: string;
  labelEn: string;
  value: string;
  /** Resolved href, or null when the channel is display-only. */
  href: string | null;
};

export type PublicStoreSettings = {
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
  maintenanceMode: boolean;
  maintenanceMessageAr: string;
  maintenanceMessageEn: string;
};

export const EMPTY_PUBLIC_SETTINGS: PublicStoreSettings = {
  socialLinks: [],
  contactChannels: [],
  contactNoteAr: "",
  contactNoteEn: "",
  seo: {
    titleAr: "",
    titleEn: "",
    descriptionAr: "",
    descriptionEn: "",
    ogImageUrl: null,
  },
  maintenanceMode: false,
  maintenanceMessageAr: "",
  maintenanceMessageEn: "",
};

function channelHref(kind: ContactChannelKind, value: string, url: string | undefined): string | null {
  if (url) {
    return url;
  }

  if (!value) {
    return null;
  }

  switch (kind) {
    case "email":
      return `mailto:${value}`;
    case "phone":
      return `tel:${value.replace(/[^\d+]/g, "")}`;
    case "whatsapp":
      return `https://wa.me/${value.replace(/[^\d]/g, "")}`;
    case "telegram":
      return `https://t.me/${value.replace(/^@/, "")}`;
    default:
      return null;
  }
}

function normalizeSocialLinks(value: unknown[]): SocialLink[] {
  return value.flatMap((raw, index) => {
    const parsed = socialLinkSchema.safeParse(raw);

    if (!parsed.success) {
      return [];
    }

    const link = parsed.data;
    const platform = link.platform ?? "website";
    const fallbackLabel = link.label_en || link.label_ar || platform;

    return [
      {
        id: link.id ?? `${platform}-${index}`,
        platform,
        labelAr: link.label_ar || fallbackLabel,
        labelEn: link.label_en || fallbackLabel,
        url: link.url,
      },
    ];
  });
}

function normalizeContactChannels(value: unknown[]): ContactChannel[] {
  return value.flatMap((raw, index) => {
    const parsed = contactChannelSchema.safeParse(raw);

    if (!parsed.success) {
      return [];
    }

    const channel = parsed.data;
    const kind = channel.kind ?? "link";
    const rawValue = channel.value ?? "";
    const href = channelHref(kind, rawValue, channel.url);

    if (!rawValue && !href) {
      return [];
    }

    const fallbackLabel = channel.label_en || channel.label_ar || kind;

    return [
      {
        id: channel.id ?? `${kind}-${index}`,
        kind,
        labelAr: channel.label_ar || fallbackLabel,
        labelEn: channel.label_en || fallbackLabel,
        value: rawValue || href || "",
        href,
      },
    ];
  });
}

export function normalizePublicSettings(value: unknown): PublicStoreSettings {
  const parsed = publicSettingsSchema.safeParse(value ?? {});

  if (!parsed.success) {
    return EMPTY_PUBLIC_SETTINGS;
  }

  const settings = parsed.data;

  return {
    socialLinks: normalizeSocialLinks(settings.social_links ?? []),
    contactChannels: normalizeContactChannels(settings.contact?.channels ?? []),
    contactNoteAr: settings.contact?.note_ar ?? "",
    contactNoteEn: settings.contact?.note_en ?? "",
    seo: {
      titleAr: settings.seo?.title_ar ?? "",
      titleEn: settings.seo?.title_en ?? "",
      descriptionAr: settings.seo?.description_ar ?? "",
      descriptionEn: settings.seo?.description_en ?? "",
      ogImageUrl: settings.seo?.og_image_url ?? null,
    },
    maintenanceMode: settings.maintenance_mode ?? false,
    maintenanceMessageAr: settings.maintenance_message_ar ?? "",
    maintenanceMessageEn: settings.maintenance_message_en ?? "",
  };
}

export function getSocialLinkLabel(link: SocialLink, locale: Locale): string {
  return locale === "ar" ? link.labelAr : link.labelEn;
}

export function getContactChannelLabel(channel: ContactChannel, locale: Locale): string {
  return locale === "ar" ? channel.labelAr : channel.labelEn;
}
