import { describe, expect, it } from "vitest";
import arAdmin from "../../storefront/app/i18n/messages/ar/admin.json";
import enAdmin from "../../storefront/app/i18n/messages/en/admin.json";

describe("admin providers, sync, settings and system logs", () => {
  it("provides comprehensive provider translation strings in Arabic and English", () => {
    const pAr = arAdmin.providers;
    const pEn = enAdmin.providers;

    expect(pAr.title).toBeTruthy();
    expect(pEn.title).toBeTruthy();

    expect(pAr.groups).toHaveProperty("suppliers");
    expect(pAr.groups).toHaveProperty("payments");
    expect(pAr.groups).toHaveProperty("monitoring");

    expect(pEn.groups).toHaveProperty("suppliers");
    expect(pEn.groups).toHaveProperty("payments");
    expect(pEn.groups).toHaveProperty("monitoring");

    expect(pAr).toHaveProperty("g2bulk");
    expect(pAr).toHaveProperty("maxstore");
    expect(pAr).toHaveProperty("batstore");
    expect(pAr).toHaveProperty("sam");
    expect(pAr).toHaveProperty("binance");
    expect(pAr).toHaveProperty("logging");
    expect(pAr).toHaveProperty("telegram");
  });

  it("provides sync page translation strings", () => {
    const sAr = arAdmin.sync;
    const sEn = enAdmin.sync;

    expect(sAr.title).toBeTruthy();
    expect(sEn.title).toBeTruthy();

    expect(sAr.providers).toHaveProperty("g2bulk");
    expect(sAr.providers).toHaveProperty("maxstore");
    expect(sAr.providers).toHaveProperty("batstore");

    expect(sEn.providers).toHaveProperty("g2bulk");
    expect(sEn.providers).toHaveProperty("maxstore");
    expect(sEn.providers).toHaveProperty("batstore");
  });

  it("provides website settings and appearance translation strings", () => {
    const wAr = arAdmin.website;
    const wEn = enAdmin.website;

    expect(wAr.title).toBeTruthy();
    expect(wEn.title).toBeTruthy();

    expect(wAr).toHaveProperty("branding");
    expect(wAr).toHaveProperty("sections");
    expect(wAr).toHaveProperty("social");
    expect(wAr).toHaveProperty("contact");
    expect(wAr).toHaveProperty("theme");
    expect(wAr).toHaveProperty("seo");

    expect(wEn).toHaveProperty("branding");
    expect(wEn).toHaveProperty("sections");
    expect(wEn).toHaveProperty("social");
    expect(wEn).toHaveProperty("contact");
    expect(wEn).toHaveProperty("theme");
    expect(wEn).toHaveProperty("seo");
  });
});
