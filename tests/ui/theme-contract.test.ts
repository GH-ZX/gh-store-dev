import { describe, expect, it } from "vitest";
import { BRAND } from "@/lib/brand";

describe("GH Store brand contract", () => {
  it("keeps the customer-facing brand separate from technical identifiers", () => {
    expect(BRAND.name).toBe("GH Store");
    expect(BRAND.technicalName).toBe("GH-Store");
    expect(BRAND.defaultLocale).toBe("ar");
    expect(BRAND.locales).toEqual(["ar", "en"]);
  });
});
