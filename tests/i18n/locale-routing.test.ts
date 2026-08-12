import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  getLocaleDirection,
  isLocale,
  SUPPORTED_LOCALES,
} from "@/i18n/config";

describe("locale configuration", () => {
  it("keeps Arabic as the default and maps directions correctly", () => {
    expect(DEFAULT_LOCALE).toBe("ar");
    expect(SUPPORTED_LOCALES).toEqual(["ar", "en"]);
    expect(getLocaleDirection("ar")).toBe("rtl");
    expect(getLocaleDirection("en")).toBe("ltr");
    expect(isLocale("ar")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });
});
