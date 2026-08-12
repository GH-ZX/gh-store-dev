import { describe, expect, it } from "vitest";
import {
  EMPTY_PUBLIC_SETTINGS,
  getContactChannelLabel,
  getSocialLinkLabel,
  normalizePublicSettings,
} from "@/lib/settings/public-settings";

describe("public store settings normalization", () => {
  it("returns empty settings for a missing or malformed row", () => {
    expect(normalizePublicSettings(null)).toEqual(EMPTY_PUBLIC_SETTINGS);
    expect(normalizePublicSettings("nope")).toEqual(EMPTY_PUBLIC_SETTINGS);
  });

  it("keeps only links with a safe URL scheme", () => {
    const settings = normalizePublicSettings({
      social_links: [
        { platform: "telegram", url: "https://t.me/ghstore", label_en: "Telegram" },
        { platform: "youtube", url: "javascript:alert(1)", label_en: "Bad" },
        { platform: "tiktok", url: "not a url" },
        { url: "http://example.com" },
      ],
    });

    expect(settings.socialLinks.map((link) => link.url)).toEqual([
      "https://t.me/ghstore",
      "http://example.com",
    ]);
  });

  it("falls back to a usable label in both locales", () => {
    const [link] = normalizePublicSettings({
      social_links: [{ platform: "youtube", url: "https://youtube.com/@gh", label_en: "YouTube" }],
    }).socialLinks;

    expect(getSocialLinkLabel(link, "en")).toBe("YouTube");
    expect(getSocialLinkLabel(link, "ar")).toBe("YouTube");
  });

  it("derives a contact href from the channel kind", () => {
    const { contactChannels } = normalizePublicSettings({
      contact: {
        channels: [
          { kind: "email", value: "help@example.com", label_en: "Email" },
          { kind: "whatsapp", value: "+963 999 111 222", label_en: "WhatsApp" },
          { kind: "telegram", value: "@ghstore", label_en: "Telegram" },
          { kind: "phone", value: "+963-11-1234567", label_en: "Phone" },
        ],
      },
    });

    expect(contactChannels.map((channel) => channel.href)).toEqual([
      "mailto:help@example.com",
      "https://wa.me/963999111222",
      "https://t.me/ghstore",
      "tel:+963111234567",
    ]);
  });

  it("keeps a display-only channel and drops an empty one", () => {
    const { contactChannels } = normalizePublicSettings({
      contact: {
        channels: [
          { kind: "link", value: "Damascus office", label_en: "Address" },
          { kind: "link", label_en: "Nothing" },
        ],
      },
    });

    expect(contactChannels).toHaveLength(1);
    expect(contactChannels[0].href).toBeNull();
    expect(getContactChannelLabel(contactChannels[0], "en")).toBe("Address");
  });

  it("never exposes payment or provider configuration", () => {
    const settings = normalizePublicSettings({
      payments: { sam_api_key: "secret" },
      providers: { g2bulk_api_key: "secret" },
      seo: { title_en: "GH Store" },
    });

    expect(JSON.stringify(settings)).not.toContain("secret");
    expect(settings.seo.titleEn).toBe("GH Store");
  });

  it("reads maintenance state", () => {
    const settings = normalizePublicSettings({
      maintenance_mode: true,
      maintenance_message_ar: "صيانة",
      maintenance_message_en: null,
    });

    expect(settings.maintenanceMode).toBe(true);
    expect(settings.maintenanceMessageAr).toBe("صيانة");
    expect(settings.maintenanceMessageEn).toBe("");
  });
});
