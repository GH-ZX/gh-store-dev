import { describe, expect, it } from "vitest";
import {
  APP_NAME,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
} from "@/lib/config/app";

describe("GH Store application configuration", () => {
  it("uses the customer-facing name and Arabic default locale", () => {
    expect(APP_NAME).toBe("GH Store");
    expect(DEFAULT_LOCALE).toBe("ar");
    expect(SUPPORTED_LOCALES).toEqual(["ar", "en"]);
  });
});
