import { describe, expect, it } from "vitest";
import arAdmin from "../../storefront/app/i18n/messages/ar/admin.json";
import enAdmin from "../../storefront/app/i18n/messages/en/admin.json";

describe("admin overview page logic & contracts", () => {
  it("provides all required overview translation keys in Arabic and English", () => {
    const oAr = arAdmin.overview;
    const oEn = enAdmin.overview;

    expect(oAr.title).toBeTruthy();
    expect(oEn.title).toBeTruthy();

    expect(oAr.attention).toHaveProperty("title");
    expect(oAr.attention).toHaveProperty("allClear");
    expect(oAr.attention).toHaveProperty("stuck");
    expect(oAr.attention).toHaveProperty("recharges");
    expect(oAr.attention).toHaveProperty("payments");
    expect(oAr.attention).toHaveProperty("support");
    expect(oAr.attention).toHaveProperty("reviews");

    expect(oAr.kpis).toHaveProperty("revenueToday");
    expect(oAr.kpis).toHaveProperty("revenue7");
    expect(oAr.kpis).toHaveProperty("newCustomers");
    expect(oAr.kpis).toHaveProperty("avgOrder");

    expect(oAr.chart).toHaveProperty("title");
    expect(oAr.earnings).toHaveProperty("title");
    expect(oAr.latest).toHaveProperty("title");
  });

  it("accurately computes week-over-week revenue delta percentages", () => {
    const computeDelta = (rev7: number | null, prev7: number | null) => {
      if (rev7 !== null && prev7 !== null && prev7 > 0) {
        return Math.round(((rev7 - prev7) / prev7) * 100);
      }
      return null;
    };

    expect(computeDelta(120, 100)).toBe(20);
    expect(computeDelta(80, 100)).toBe(-20);
    expect(computeDelta(100, 100)).toBe(0);
    expect(computeDelta(null, 100)).toBeNull();
    expect(computeDelta(100, 0)).toBeNull();
  });

  it("accurately calculates gross margin percentages", () => {
    const computeMargin = (revenue: number | null, profit: number | null) => {
      if (revenue && profit !== null && revenue > 0) {
        return Math.round((profit / revenue) * 100);
      }
      return null;
    };

    expect(computeMargin(1000, 350)).toBe(35);
    expect(computeMargin(500, 50)).toBe(10);
    expect(computeMargin(100, -10)).toBe(-10);
    expect(computeMargin(0, 50)).toBeNull();
    expect(computeMargin(null, 50)).toBeNull();
  });
});
