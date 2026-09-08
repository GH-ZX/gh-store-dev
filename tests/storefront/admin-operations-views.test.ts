import { describe, expect, it } from "vitest";
import { statusLabel } from "../../storefront/app/components/admin/operations-shared";
import arAdmin from "../../storefront/app/i18n/messages/ar/admin.json";
import enAdmin from "../../storefront/app/i18n/messages/en/admin.json";

describe("admin sales, recharges and customers operations", () => {
  it("translates common operation statuses accurately in Arabic and English", () => {
    // English
    expect(statusLabel("all", "en")).toBe("All");
    expect(statusLabel("completed", "en")).toBe("Completed");
    expect(statusLabel("pending", "en")).toBe("Queued");

    // Arabic
    expect(statusLabel("all", "ar")).toBe("الكل");
    expect(statusLabel("completed", "ar")).toBe("مكتمل");
    expect(statusLabel("pending", "ar")).toBe("قيد الانتظار");
  });

  it("handles recharge-specific statuses correctly", () => {
    expect(statusLabel("approved", "en", "recharges")).toBeTruthy();
    expect(statusLabel("rejected", "en", "recharges")).toBeTruthy();
    expect(statusLabel("approved", "ar", "recharges")).toBeTruthy();
    expect(statusLabel("rejected", "ar", "recharges")).toBeTruthy();
  });
  it("translates low_funds status correctly in Arabic and English", () => {
    expect(statusLabel("low_funds", "en")).toBe("Low API Funds");
    expect(statusLabel("low_funds", "ar")).toBe("نقص رصيد المزود");
  });


  it("ensures all operation group translation keys exist in both locales", () => {
    const groups = ["orders", "recharges", "payments", "customers"] as const;

    for (const group of groups) {
      expect(arAdmin[group]).toHaveProperty("title");
      expect(enAdmin[group]).toHaveProperty("title");
    }
  });
});
